/* eslint-disable camelcase */

/**
 * Firebase Cloud Functions for TripSync
 * 
 * This file contains all server-side cloud functions including:
 * - User management and profile operations
 * - Friend request system
 * - Trip invitations and member management
 * - Weather API proxy endpoints
 * - Push notification triggers
 * - Database cleanup operations
 */

const { onCall, HttpsError, onRequest } = require("firebase-functions/v2/https");
const { onDocumentCreated, onDocumentWritten, onDocumentDeleted } = require("firebase-functions/v2/firestore");
const logger = require("firebase-functions/logger");
const { initializeApp, getApp } = require("firebase-admin/app");
const admin = require("firebase-admin");
const { defineSecret } = require("firebase-functions/params");
const { nanoid } = require("nanoid");

// Initializing Firebase Admin SDK, handling cases where it's already initialized
try { getApp(); } catch { initializeApp(); }
const db = admin.firestore();

// Google Maps API key stored as a secret for secure access
const MAPS_KEY = defineSecret("GOOGLE_MAPS_API_KEY");

// Structured logging helpers for consistent log formatting across all functions
function logInfo(message, metadata = {}) {
  logger.info(message, {
    ...metadata,
    timestamp: new Date().toISOString(),
  });
}

function logError(message, error, metadata = {}) {
  logger.error(message, {
    ...metadata,
    error: {
      message: error?.message || String(error),
      stack: error?.stack,
      code: error?.code,
    },
    timestamp: new Date().toISOString(),
  });
}

function logWarning(message, metadata = {}) {
  logger.warn(message, {
    ...metadata,
    timestamp: new Date().toISOString(),
  });
}

function logFunctionCall(functionName, uid, metadata = {}) {
  logInfo(`Function called: ${functionName}`, {
    function: functionName,
    user_id: uid,
    ...metadata,
  });
}

function logFunctionSuccess(functionName, uid, metadata = {}) {
  logInfo(`Function succeeded: ${functionName}`, {
    function: functionName,
    user_id: uid,
    status: 'success',
    ...metadata,
  });
}

function logFunctionError(functionName, uid, error, metadata = {}) {
  logError(`Function failed: ${functionName}`, error, {
    function: functionName,
    user_id: uid,
    status: 'error',
    ...metadata,
  });
}

// Authentication and authorization helper functions

// Verifies that the request has an authenticated user
function assertAuth(req) {
  if (!req.auth) {
    throw new HttpsError("unauthenticated", "Sign in first.");
  }
  return req.auth.uid;
}

// Verifies that the user is a member of the specified trip
async function assertTripMember(tripId, uid) {
  const snap = await db.collection("trips").doc(tripId).get();
  if (!snap.exists) {
    throw new HttpsError("not-found", "Trip not found.");
  }
  const data = snap.data() || {};
  if (!data.members || data.members[uid] !== true) {
    throw new HttpsError("permission-denied", "Not a trip member.");
  }
  return { snap, data };
}

// Verifies that the user has one of the allowed roles in the trip
async function assertTripRole(tripId, uid, allowed = ["owner", "editor"]) {
  const { data } = await assertTripMember(tripId, uid);
  const role = data.roles?.[uid];
  if (!allowed.includes(role)) {
    throw new HttpsError("permission-denied", "Insufficient role.");
  }
  return { role };
}

// Returns a Firestore server timestamp for consistent time tracking
function nowTs() {
  return admin.firestore.FieldValue.serverTimestamp();
}

// Rate limit configuration for different functions
const RATE_LIMITS = {
  sendFriendRequest: { maxRequests: 10, windowMs: 60 * 1000 },
  inviteFriendToTrip: { maxRequests: 20, windowMs: 60 * 1000 },
  inviteByEmailToTrip: { maxRequests: 20, windowMs: 60 * 1000 },
  searchUsers: { maxRequests: 30, windowMs: 60 * 1000 },
  respondToFriendRequest: { maxRequests: 30, windowMs: 60 * 1000 },
  acceptTripInvite: { maxRequests: 10, windowMs: 60 * 1000 },
  ensureUserProfile: { maxRequests: 5, windowMs: 60 * 1000 },
};

// Checks if a user has exceeded the rate limit for a specific function
async function checkRateLimit(uid, functionName) {
  const limit = RATE_LIMITS[functionName];
  if (!limit) return true;

  const now = Date.now();
  const windowStart = now - limit.windowMs;
  
  const rateLimitRef = db.collection("rateLimits").doc(`${uid}_${functionName}`);
  const snap = await rateLimitRef.get();
  
  if (!snap.exists) {
    await rateLimitRef.set({
      count: 1,
      windowStart: now,
      lastRequest: now,
    });
    return true;
  }
  
  const data = snap.data();
  if (data.windowStart < windowStart) {
    await rateLimitRef.set({
      count: 1,
      windowStart: now,
      lastRequest: now,
    });
    return true;
  }
  
  if (data.count >= limit.maxRequests) {
    throw new HttpsError(
      "resource-exhausted",
      `Rate limit exceeded. Maximum ${limit.maxRequests} requests per ${limit.windowMs / 1000} seconds.`
    );
  }
  
  await rateLimitRef.update({
    count: admin.firestore.FieldValue.increment(1),
    lastRequest: now,
  });
  
  return true;
}

// Creates or updates a user profile document from Firebase Auth user data
exports.ensureUserProfile = onCall({ region: "us-central1" }, async (req) => {
  const uid = assertAuth(req);

  const user = await admin.auth().getUser(uid);
  const profileRef = db.collection("users").doc(uid);

  await db.runTransaction(async (tx) => {
    const snap = await tx.get(profileRef);
    const base = {
      email: user.email || null,
      displayName: user.displayName || null,
      photoURL: user.photoURL || null,
    };
    if (!snap.exists) {
      tx.set(profileRef, { ...base, createdAt: nowTs() });
    } else {
      tx.set(profileRef, base, { merge: true });
    }
  });

  return { ok: true };
});

// Sends a friend request from the authenticated user to another user by email
exports.sendFriendRequest = onCall({ region: "us-central1" }, async (req) => {
  const fromUid = assertAuth(req);
  logFunctionCall("sendFriendRequest", fromUid, { toEmail: req.data?.toEmail });
  
  try {
    await checkRateLimit(fromUid, "sendFriendRequest");
    
    const toEmailRaw = req.data?.toEmail;
    const toEmail = typeof toEmailRaw === "string" ? toEmailRaw.trim().toLowerCase() : "";

    if (!toEmail) {
      throw new HttpsError("invalid-argument", "toEmail required.");
    }

    const userSnap = await db.collection("users").where("email", "==", toEmail).limit(1).get();
    if (userSnap.empty) {
      logWarning("User not found for friend request", { fromUid, toEmail });
      throw new HttpsError("not-found", "User not found.");
    }
    const toUid = userSnap.docs[0].id;
    if (toUid === fromUid) {
      throw new HttpsError("failed-precondition", "Can't friend yourself.");
    }

    const pending = await db
      .collection("friendRequests")
      .where("fromUid", "==", fromUid)
      .where("toUid", "==", toUid)
      .where("status", "==", "pending")
      .limit(1)
      .get();

    if (!pending.empty) {
      logFunctionSuccess("sendFriendRequest", fromUid, { alreadyExists: true });
      return { ok: true, already: true };
    }

    await db.collection("friendRequests").add({
      fromUid,
      toUid,
      status: "pending",
      createdAt: nowTs(),
      decidedAt: null,
    });

    logFunctionSuccess("sendFriendRequest", fromUid, { toUid });
    return { ok: true };
  } catch (error) {
    logFunctionError("sendFriendRequest", fromUid, error, { toEmail: req.data?.toEmail });
    throw error;
  }
});

// Accepts or rejects a friend request
exports.respondToFriendRequest = onCall({ region: "us-central1" }, async (req) => {
  const uid = assertAuth(req);
  logFunctionCall("respondToFriendRequest", uid, { requestId: req.data?.requestId, action: req.data?.action });
  
  try {
    await checkRateLimit(uid, "respondToFriendRequest");
    
    const requestId = req.data?.requestId;
    const action = req.data?.action;

    if (!requestId || !["accept", "reject"].includes(action)) {
      throw new HttpsError("invalid-argument", "requestId and action required.");
    }

  const reqRef = db.collection("friendRequests").doc(requestId);
  const reqSnap = await reqRef.get();
  if (!reqSnap.exists) {
    throw new HttpsError("not-found", "Request not found.");
  }
  const fr = reqSnap.data();

  if (fr.toUid !== uid) {
    throw new HttpsError("permission-denied", "Not your request.");
  }
  if (fr.status !== "pending") {
    return { ok: true, status: fr.status };
  }

  if (action === "reject") {
    await reqRef.update({
      status: "rejected",
      decidedAt: nowTs(),
    });
    return { ok: true };
  }

  const batch = db.batch();
  const aRef = db.collection("users").doc(fr.fromUid).collection("friends").doc(uid);
  const bRef = db.collection("users").doc(uid).collection("friends").doc(fr.fromUid);

  batch.set(aRef, { createdAt: nowTs() });
  batch.set(bRef, { createdAt: nowTs() });
  batch.update(reqRef, { status: "accepted", decidedAt: nowTs() });

    await batch.commit();
    logFunctionSuccess("respondToFriendRequest", uid, { requestId, action });
    return { ok: true };
  } catch (error) {
    logFunctionError("respondToFriendRequest", uid, error, { requestId: req.data?.requestId });
    throw error;
  }
});

// Invites an existing friend to join a trip with a specified role
exports.inviteFriendToTrip = onCall({ region: "us-central1" }, async (req) => {
  const inviterUid = assertAuth(req);
  logFunctionCall("inviteFriendToTrip", inviterUid, { 
    tripId: req.data?.tripId, 
    friendUid: req.data?.friendUid,
    role: req.data?.role 
  });
  
  try {
    await checkRateLimit(inviterUid, "inviteFriendToTrip");
    
    const tripId = req.data?.tripId;
    const friendUid = req.data?.friendUid;
    const role = req.data?.role || "editor";

    if (!tripId || !friendUid) {
      throw new HttpsError("invalid-argument", "tripId and friendUid required.");
    }
    if (!["editor", "viewer"].includes(role)) {
      throw new HttpsError("invalid-argument", "Invalid role.");
    }

    await assertTripRole(tripId, inviterUid, ["owner", "editor"]);

    const tripRef = db.collection("trips").doc(tripId);
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(tripRef);
      if (!snap.exists) throw new HttpsError("not-found", "Trip not found.");
      const t = snap.data() || {};
      const members = t.members || {};
      const roles = t.roles || {};

      if (members[friendUid] === true) return;

      members[friendUid] = true;
      if (!roles[friendUid]) roles[friendUid] = role;

      tx.update(tripRef, { members, roles });

      const metadataRef = tripRef.collection("encryptionKeys").doc("metadata");
      const metadataSnap = await tx.get(metadataRef);
      if (metadataSnap.exists && metadataSnap.data().enabled === true) {
        const memberKeyRef = tripRef.collection("encryptionKeys").doc(friendUid);
        const memberKeySnap = await tx.get(memberKeyRef);
        if (!memberKeySnap.exists) {
          tx.set(memberKeyRef, {
            pending: true,
            sharedBy: inviterUid,
            sharedAt: nowTs(),
          });
        }
      }

      const actRef = tripRef.collection("activities").doc();
      tx.set(actRef, {
        type: "member.add",
        message: `Invited member joined`,
        actorId: inviterUid,
        createdAt: nowTs(),
      });
    });

    logFunctionSuccess("inviteFriendToTrip", inviterUid, { tripId, friendUid, role });
    return { ok: true };
  } catch (error) {
    logFunctionError("inviteFriendToTrip", inviterUid, error, { 
      tripId: req.data?.tripId, 
      friendUid: req.data?.friendUid 
    });
    throw error;
  }
});

// Creates an email-based trip invitation that can be accepted via token
exports.inviteByEmailToTrip = onCall({ region: "us-central1" }, async (req) => {
  const inviterUid = assertAuth(req);
  logFunctionCall("inviteByEmailToTrip", inviterUid, { tripId: req.data?.tripId, email: req.data?.email });
  
  try {
    await checkRateLimit(inviterUid, "inviteByEmailToTrip");
    
    const tripId = req.data?.tripId;
    const emailRaw = req.data?.email;
    const role = req.data?.role || "editor";
    const ttlHours = Number(req.data?.ttlHours ?? 72);

    const email = typeof emailRaw === "string" ? emailRaw.trim().toLowerCase() : "";

    if (!tripId || !email) {
      throw new HttpsError("invalid-argument", "tripId and email required.");
    }
    if (!["editor", "viewer"].includes(role)) {
      throw new HttpsError("invalid-argument", "Invalid role.");
    }

    await assertTripRole(tripId, inviterUid, ["owner", "editor"]);

  const token = nanoid(40);
  const now = admin.firestore.Timestamp.now();
  const expiresAt = admin.firestore.Timestamp.fromMillis(
    now.toMillis() + ttlHours * 3600 * 1000
  );

  const inviteRef = db.collection("trips").doc(tripId).collection("invites").doc();
  await inviteRef.set({
    type: "email",
    invitedBy: inviterUid,
    toUid: null,
    email,
    token,
    role,
    status: "pending",
    createdAt: now,
    expiresAt,
    acceptedBy: null,
  });

    logFunctionSuccess("inviteByEmailToTrip", inviterUid, { tripId, inviteId: inviteRef.id });
    return { ok: true, inviteId: inviteRef.id, token };
  } catch (error) {
    logFunctionError("inviteByEmailToTrip", inviterUid, error, { tripId: req.data?.tripId });
    throw error;
  }
});

// Searches for users by email or display name
exports.searchUsers = onCall({ region: "us-central1" }, async (req) => {
  const uid = assertAuth(req);
  logFunctionCall("searchUsers", uid, { searchTerm: req.data?.searchTerm });
  
  try {
    await checkRateLimit(uid, "searchUsers");
    
    const searchTerm = String(req.data?.searchTerm || "").trim().toLowerCase();

    if (!searchTerm || searchTerm.length < 2) {
      throw new HttpsError("invalid-argument", "Search term must be at least 2 characters.");
    }

    const emailQuery = db.collection("users")
      .where("email", ">=", searchTerm)
      .where("email", "<=", searchTerm + "\uf8ff")
      .limit(10);

    const emailResults = await emailQuery.get();
    const foundUids = new Set();
    const results = [];

    emailResults.forEach((doc) => {
      const data = doc.data();
      if (doc.id !== uid && data.email) {
        foundUids.add(doc.id);
        results.push({
          uid: doc.id,
          email: data.email,
          displayName: data.displayName || null,
          photoURL: data.photoURL || null,
        });
      }
    });

    if (results.length < 10) {
      const nameQuery = db.collection("users")
        .where("displayName", ">=", searchTerm)
        .where("displayName", "<=", searchTerm + "\uf8ff")
        .limit(10);

      const nameResults = await nameQuery.get();
      nameResults.forEach((doc) => {
        if (!foundUids.has(doc.id) && doc.id !== uid && results.length < 10) {
          const data = doc.data();
          foundUids.add(doc.id);
          results.push({
            uid: doc.id,
            email: data.email || null,
            displayName: data.displayName || null,
            photoURL: data.photoURL || null,
          });
        }
      });
    }

    logFunctionSuccess("searchUsers", uid, { resultCount: results.length });
    return { users: results };
  } catch (error) {
    logFunctionError("searchUsers", uid, error, { searchTerm: req.data?.searchTerm });
    throw error;
  }
});

// Accepts a trip invitation using a trip ID and token
exports.acceptTripInvite = onCall({ region: "us-central1" }, async (req) => {
  const uid = assertAuth(req);
  logFunctionCall("acceptTripInvite", uid, { tripId: req.data?.tripId });
  
  try {
    await checkRateLimit(uid, "acceptTripInvite");
    
    const tripId = req.data?.tripId;
    const token = req.data?.token;

    if (!tripId || !token) {
      throw new HttpsError("invalid-argument", "tripId and token required.");
    }

  const tripRef = db.collection("trips").doc(tripId);
  const inviteSnap = await tripRef
    .collection("invites")
    .where("token", "==", token)
    .limit(1)
    .get();

  if (inviteSnap.empty) {
    throw new HttpsError("not-found", "Invite not found.");
  }

  const docRef = inviteSnap.docs[0].ref;
  const invite = inviteSnap.docs[0].data();

  if (invite.status !== "pending") {
    throw new HttpsError("failed-precondition", "Invite already used.");
  }
  if (invite.expiresAt.toMillis() < Date.now()) {
    await docRef.update({ status: "expired" });
    throw new HttpsError("deadline-exceeded", "Invite expired.");
  }

  const grantRole = invite.role || "editor";

  await db.runTransaction(async (tx) => {
    const tSnap = await tx.get(tripRef);
    if (!tSnap.exists) throw new HttpsError("not-found", "Trip not found.");
    const t = tSnap.data() || {};

    const members = t.members || {};
    const roles = t.roles || {};

    if (members[uid] === true) {
      tx.update(docRef, { status: "accepted", acceptedBy: uid });
      return;
    }

    members[uid] = true;
    roles[uid] = grantRole;

    tx.update(tripRef, { members, roles });
    tx.update(docRef, { status: "accepted", acceptedBy: uid });

    const metadataRef = tripRef.collection("encryptionKeys").doc("metadata");
    const metadataSnap = await tx.get(metadataRef);
    if (metadataSnap.exists && metadataSnap.data().enabled === true) {
      const memberKeyRef = tripRef.collection("encryptionKeys").doc(uid);
      const memberKeySnap = await tx.get(memberKeyRef);
      if (!memberKeySnap.exists) {
        tx.set(memberKeyRef, {
          pending: true,
          sharedBy: invite.invitedBy,
          sharedAt: nowTs(),
        });
      }
    }

    const actRef = tripRef.collection("activities").doc();
    tx.set(actRef, {
      type: "member.add",
      message: `New member joined`,
      actorId: uid,
      createdAt: nowTs(),
    });
  });

    logFunctionSuccess("acceptTripInvite", uid, { tripId });
    return { ok: true };
  } catch (error) {
    logFunctionError("acceptTripInvite", uid, error, { tripId: req.data?.tripId });
    throw error;
  }
});

// Proxies daily weather forecast requests to Google Maps Weather API
exports.weatherDaily = onRequest(
  { region: "us-central1", secrets: [MAPS_KEY] },
  async (req, res) => {
    const reqHeaders = req.get("Access-Control-Request-Headers");
    res.set("Access-Control-Allow-Origin", "*");
    res.set("Access-Control-Allow-Methods", "GET, OPTIONS");
    res.set("Access-Control-Allow-Headers", reqHeaders || "Content-Type, x-tripsync");
    res.set("Access-Control-Max-Age", "3600");
    if (req.method === "OPTIONS") return res.status(204).send("");

    try {
      const lat = parseFloat(req.query.lat);
      const lng = parseFloat(req.query.lng);
      const units = String(req.query.units || "IMPERIAL").toUpperCase();
      const dateKey = String(req.query.date || "").slice(0, 10);

      if (!Number.isFinite(lat) || !Number.isFinite(lng) || !dateKey) {
        return res.status(400).json({ error: "lat,lng,date are required" });
      }

      const apiKey = MAPS_KEY.value();
      if (!apiKey) {
        logger.error("Missing GOOGLE_MAPS_API_KEY secret");
        return res.status(500).json({ error: "Server missing GOOGLE_MAPS_API_KEY" });
      }

      const url = new URL("https://weather.googleapis.com/v1/forecast/days:lookup");
      url.searchParams.set("key", apiKey);
      url.searchParams.set("location.latitude", String(lat));
      url.searchParams.set("location.longitude", String(lng));
      url.searchParams.set("units_system", units === "METRIC" ? "METRIC" : "IMPERIAL");
      url.searchParams.set("days", "10");
      url.searchParams.set("language_code", "en-US");

      const r = await fetch(url);
      if (!r.ok) {
        const body = await r.text();
        logger.error("Weather API error", { status: r.status, body });
        return res.status(r.status).json({ error: "weather_api_error", body });
      }

      const data = await r.json();
      const days =
        (data && data.daily && data.daily.days) ||
        (data && data.dailyForecasts && data.dailyForecasts.days) ||
        data.forecastDays ||
        [];

      res.set("Cache-Control", "public, max-age=300");
      return res.json({ days });
    } catch (e) {
      logger.error("weatherDaily failed", e);
      return res.status(500).json({ error: String(e?.message || e) });
    }
  }
);

// Proxies current weather requests to Google Maps Weather API
exports.weatherCurrent = onRequest(
  { region: "us-central1", secrets: [MAPS_KEY] },
  async (req, res) => {
    const reqHeaders = req.get("Access-Control-Request-Headers");
    res.set("Access-Control-Allow-Origin", "*");
    res.set("Access-Control-Allow-Methods", "GET, OPTIONS");
    res.set("Access-Control-Allow-Headers", reqHeaders || "Content-Type, x-tripsync");
    res.set("Access-Control-Max-Age", "3600");
    if (req.method === "OPTIONS") return res.status(204).send("");

    try {
      const lat = parseFloat(req.query.lat);
      const lng = parseFloat(req.query.lng);
      const units = String(req.query.units || "IMPERIAL").toUpperCase();
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
        return res.status(400).json({ error: "lat,lng are required" });
      }

      const apiKey = MAPS_KEY.value();
      if (!apiKey) return res.status(500).json({ error: "Server missing GOOGLE_MAPS_API_KEY" });

      return res.json({
        relativeHumidity: null,
        uvIndex: null,
        visibility: null,
        precipitation: {
          probability: { percent: null, type: null },
          qpf: { quantity: null, unit: "INCHES" },
        },
        weatherCondition: null,
      });
    } catch (e) {
      return res.status(500).json({ error: String(e?.message || e) });
    }
  }
);

// Proxies hourly weather forecast requests to Google Maps Weather API
exports.weatherHourly = onRequest(
  { region: "us-central1", secrets: [MAPS_KEY] },
  async (req, res) => {
    const reqHeaders = req.get("Access-Control-Request-Headers");
    res.set("Access-Control-Allow-Origin", "*");
    res.set("Access-Control-Allow-Methods", "GET, OPTIONS");
    res.set("Access-Control-Allow-Headers", reqHeaders || "Content-Type, x-tripsync");
    res.set("Access-Control-Max-Age", "3600");
    if (req.method === "OPTIONS") return res.status(204).send("");

    try {
      const lat = parseFloat(req.query.lat);
      const lng = parseFloat(req.query.lng);
      const units = String(req.query.units || "IMPERIAL").toUpperCase();
      const dateKey = String(req.query.date || "").slice(0, 10);
      if (!Number.isFinite(lat) || !Number.isFinite(lng) || !dateKey) {
        return res.status(400).json({ error: "lat,lng,date are required" });
      }

      const apiKey = MAPS_KEY.value();
      if (!apiKey) return res.status(500).json({ error: "Server missing GOOGLE_MAPS_API_KEY" });

      return res.json({ hours: [] });
    } catch (e) {
      return res.status(500).json({ error: String(e?.message || e) });
    }
  }
);

const messaging = admin.messaging();

// Retrieves notification preferences for a user with default values if not set
async function getUserNotificationPrefs(uid) {
  try {
    const userDoc = await db.collection("users").doc(uid).get();
    const prefs = userDoc.data()?.notificationPrefs || {};
    return {
      chatMessages: prefs.chatMessages !== false,
      mentions: prefs.mentions !== false,
      friendRequests: prefs.friendRequests !== false,
      tripInvites: prefs.tripInvites !== false,
      comments: prefs.comments !== false,
    };
  } catch (error) {
    logError("Error getting notification preferences", error, { uid });
    return {
      chatMessages: true,
      mentions: true,
      friendRequests: true,
      tripInvites: true,
      comments: true,
    };
  }
}

// Retrieves all FCM push notification tokens for a user
async function getUserFCMTokens(uid) {
  try {
    const tokensRef = db.collection("users").doc(uid).collection("tokens");
    const snapshot = await tokensRef.get();
    return snapshot.docs.map((doc) => doc.data().token).filter(Boolean);
  } catch (error) {
    logError("Error getting FCM tokens", error, { uid });
    return [];
  }
}

// Sends a push notification to a user, respecting their notification preferences and cleaning up invalid tokens
async function sendNotification(uid, notification, data = {}) {
  try {
    const prefs = await getUserNotificationPrefs(uid);
    
    const notificationType = data.type;
    if (notificationType === "chat_message" && !prefs.chatMessages) return;
    if (notificationType === "mention" && !prefs.mentions) return;
    if (notificationType === "friend_request" && !prefs.friendRequests) return;
    if (notificationType === "trip_invite" && !prefs.tripInvites) return;
    if (notificationType === "comment" && !prefs.comments) return;

    const tokens = await getUserFCMTokens(uid);
    if (tokens.length === 0) {
      logInfo("No FCM tokens found for user", { uid });
      return;
    }

    const message = {
      notification: {
        title: notification.title,
        body: notification.body,
      },
      data: {
        ...data,
        click_action: "FLUTTER_NOTIFICATION_CLICK",
      },
      tokens,
    };

    const response = await messaging.sendEachForMulticast(message);
    logInfo("Notification sent", {
      uid,
      successCount: response.successCount,
      failureCount: response.failureCount,
      type: notificationType,
    });

    if (response.failureCount > 0) {
      const invalidTokens = [];
      response.responses.forEach((resp, idx) => {
        if (!resp.success && resp.error) {
          if (
            resp.error.code === "messaging/invalid-registration-token" ||
            resp.error.code === "messaging/registration-token-not-registered"
          ) {
            invalidTokens.push(tokens[idx]);
          }
        }
      });

      for (const token of invalidTokens) {
        try {
          await db.collection("users").doc(uid).collection("tokens").doc(token).delete();
        } catch (error) {
          logError("Error deleting invalid token", error, { uid, token });
        }
      }
    }
  } catch (error) {
    logError("Error sending notification", error, { uid, type: data.type });
  }
}

// Retrieves a user's display name, returning "Someone" as fallback
async function getUserDisplayName(uid) {
  try {
    const userDoc = await db.collection("users").doc(uid).get();
    return userDoc.data()?.displayName || "Someone";
  } catch (error) {
    return "Someone";
  }
}

// Retrieves a trip's name, returning "a trip" as fallback
async function getTripName(tripId) {
  try {
    const tripDoc = await db.collection("trips").doc(tripId).get();
    const data = tripDoc.data();
    return data?.name || "a trip";
  } catch (error) {
    return "a trip";
  }
}

// Sends push notifications when a chat message is created in a trip
exports.onChatMessageCreated = onDocumentCreated(
  {
    document: "trips/{tripId}/chat/{messageId}",
    region: "us-central1",
  },
  async (event) => {
    const messageData = event.data.data();
    const tripId = event.params.tripId;
    const messageId = event.params.messageId;
    const senderId = messageData.createdBy;

    if (!senderId) return;

    try {
      const tripDoc = await db.collection("trips").doc(tripId).get();
      const tripData = tripDoc.data();
      const members = Object.keys(tripData?.members || {}).filter((uid) => uid !== senderId);

      if (members.length === 0) return;

      const senderName = await getUserDisplayName(senderId);
      const tripName = await getTripName(tripId);
      const mentionedUserIds = messageData.mentionedUserIds || [];

      for (const memberId of members) {
        const isMentioned = mentionedUserIds.includes(memberId);
        const notificationType = isMentioned ? "mention" : "chat_message";

        await sendNotification(
          memberId,
          {
            title: isMentioned ? `${senderName} mentioned you` : `${senderName} sent a message`,
            body: isMentioned
              ? `In ${tripName}: ${messageData.text?.substring(0, 100) || "New message"}`
              : `In ${tripName}: ${messageData.text?.substring(0, 100) || "New message"}`,
          },
          {
            type: notificationType,
            tripId,
            messageId,
            senderId,
          }
        );
      }
    } catch (error) {
      logError("Error in onChatMessageCreated", error, { tripId, messageId });
    }
  }
);

// Sends push notifications when a comment is created on an itinerary item
exports.onCommentCreated = onDocumentCreated(
  {
    document: "trips/{tripId}/itinerary/{itemId}/comments/{commentId}",
    region: "us-central1",
  },
  async (event) => {
    const commentData = event.data.data();
    const tripId = event.params.tripId;
    const itemId = event.params.itemId;
    const commentId = event.params.commentId;
    const senderId = commentData.createdBy;

    if (!senderId) return;

    try {
      const tripDoc = await db.collection("trips").doc(tripId).get();
      const tripData = tripDoc.data();
      const members = Object.keys(tripData?.members || {}).filter((uid) => uid !== senderId);

      if (members.length === 0) return;

      const senderName = await getUserDisplayName(senderId);
      const tripName = await getTripName(tripId);
      const mentionedUserIds = commentData.mentionedUserIds || [];

      for (const memberId of members) {
        const isMentioned = mentionedUserIds.includes(memberId);

        await sendNotification(
          memberId,
          {
            title: isMentioned ? `${senderName} mentioned you` : `${senderName} commented`,
            body: isMentioned
              ? `On ${tripName}: ${commentData.text?.substring(0, 100) || "New comment"}`
              : `On ${tripName}: ${commentData.text?.substring(0, 100) || "New comment"}`,
          },
          {
            type: isMentioned ? "mention" : "comment",
            tripId,
            itemId,
            commentId,
            senderId,
          }
        );
      }
    } catch (error) {
      logError("Error in onCommentCreated", error, { tripId, itemId, commentId });
    }
  }
);

// Sends push notifications when a friend request is created
exports.onFriendRequestCreated = onDocumentCreated(
  {
    document: "friendRequests/{requestId}",
    region: "us-central1",
  },
  async (event) => {
    const requestData = event.data.data();
    const requestId = event.params.requestId;
    const fromUid = requestData.fromUid;
    const toUid = requestData.toUid;

    if (!fromUid || !toUid) return;

    try {
      const fromName = await getUserDisplayName(fromUid);

      await sendNotification(
        toUid,
        {
          title: "New friend request",
          body: `${fromName} sent you a friend request`,
        },
        {
          type: "friend_request",
          requestId,
          fromUid,
        }
      );
    } catch (error) {
      logError("Error in onFriendRequestCreated", error, { requestId });
    }
  }
);

// Sends push notifications when a trip invitation is created
exports.onTripInviteCreated = onDocumentCreated(
  {
    document: "trips/{tripId}/invites/{inviteId}",
    region: "us-central1",
  },
  async (event) => {
    const inviteData = event.data.data();
    const tripId = event.params.tripId;
    const inviteId = event.params.inviteId;
    const invitedBy = inviteData.invitedBy;
    const toUid = inviteData.toUid;
    const email = inviteData.email;

    if (!invitedBy) return;

    try {
      if (!toUid) {
        return;
      }

      const inviterName = await getUserDisplayName(invitedBy);
      const tripName = await getTripName(tripId);

      await sendNotification(
        toUid,
        {
          title: "Trip invitation",
          body: `${inviterName} invited you to ${tripName}`,
        },
        {
          type: "trip_invite",
          tripId,
          inviteId,
          invitedBy,
        }
      );
    } catch (error) {
      logError("Error in onTripInviteCreated", error, { tripId, inviteId });
    }
  }
);

// Sends push notifications when a new member is added to a trip
exports.onTripMemberAdded = onDocumentWritten(
  {
    document: "trips/{tripId}",
    region: "us-central1",
  },
  async (event) => {
    const beforeData = event.data.before.data();
    const afterData = event.data.after.data();
    const tripId = event.params.tripId;

    const beforeMembers = beforeData?.members || {};
    const afterMembers = afterData?.members || {};

    const newMembers = Object.keys(afterMembers).filter(
      (uid) => afterMembers[uid] === true && beforeMembers[uid] !== true
    );

    if (newMembers.length === 0) return;

    try {
      const existingMembers = Object.keys(beforeMembers).filter((uid) => beforeMembers[uid] === true);
      const inviterId = existingMembers[0] || afterData?.ownerId;

      if (!inviterId) return;

      const inviterName = await getUserDisplayName(inviterId);
      const tripName = await getTripName(tripId);

      for (const newMemberId of newMembers) {
        if (newMemberId === inviterId) continue;

        await sendNotification(
          newMemberId,
          {
            title: "Trip invitation",
            body: `${inviterName} added you to ${tripName}`,
          },
          {
            type: "trip_invite",
            tripId,
            invitedBy: inviterId,
          }
        );
      }
    } catch (error) {
      logError("Error in onTripMemberAdded", error, { tripId });
    }
  }
);

// Cleans up all subcollections when a trip document is deleted
exports.onTripDeleted = onDocumentDeleted(
  {
    document: "trips/{tripId}",
    region: "us-central1",
  },
  async (event) => {
    const tripId = event.params.tripId;

    try {
      logInfo("Cleaning up all subcollections for deleted trip", { tripId });

      const tripRef = db.collection("trips").doc(tripId);
      let totalDeleted = 0;

      async function deleteCollection(collectionRef, collectionName) {
        try {
          const snap = await collectionRef.get();
          if (snap.empty) {
            logInfo(`No ${collectionName} found for deleted trip`, { tripId });
            return 0;
          }

          const docs = snap.docs;
          let deleted = 0;
          
          for (let i = 0; i < docs.length; i += 500) {
            const batch = db.batch();
            const batchDocs = docs.slice(i, i + 500);
            batchDocs.forEach((doc) => {
              batch.delete(doc.ref);
            });
            await batch.commit();
            deleted += batchDocs.length;
          }

          logInfo(`Cleaned up ${collectionName} for deleted trip`, {
            tripId,
            deletedCount: deleted,
          });
          return deleted;
        } catch (error) {
          logError(`Error cleaning up ${collectionName} for deleted trip`, error, { tripId });
          return 0;
        }
      }

      totalDeleted += await deleteCollection(
        tripRef.collection("encryptionKeys"),
        "encryptionKeys"
      );

      const itineraryRef = tripRef.collection("itinerary");
      const itinerarySnap = await itineraryRef.get();
      if (!itinerarySnap.empty) {
        for (const itemDoc of itinerarySnap.docs) {
          await deleteCollection(
            itemDoc.ref.collection("comments"),
            `comments for itinerary item ${itemDoc.id}`
          );
        }
        totalDeleted += await deleteCollection(itineraryRef, "itinerary");
      }

      totalDeleted += await deleteCollection(
        tripRef.collection("activities"),
        "activities"
      );

      totalDeleted += await deleteCollection(
        tripRef.collection("chat"),
        "chat"
      );

      totalDeleted += await deleteCollection(
        tripRef.collection("invites"),
        "invites"
      );

      totalDeleted += await deleteCollection(
        tripRef.collection("forecasts"),
        "forecasts"
      );

      logInfo("Successfully cleaned up all subcollections for deleted trip", {
        tripId,
        totalDeletedCount: totalDeleted,
      });
    } catch (error) {
      logError("Error cleaning up subcollections for deleted trip", error, { tripId });
    }
  }
);

// Removes encryption keys for trips that no longer exist
exports.cleanupOrphanedEncryptionKeys = onCall({ region: "us-central1" }, async (req) => {
  const uid = assertAuth(req);

  try {
    logFunctionCall("cleanupOrphanedEncryptionKeys", uid);

    const tripsSnap = await db.collection("trips").select().get();
    const existingTripIds = new Set(tripsSnap.docs.map((doc) => doc.id));

    let cleanedCount = 0;
    let checkedCount = 0;

    const allTrips = await db.collection("trips").get();
    const tripIds = allTrips.docs.map((doc) => doc.id);

    for (const tripId of tripIds) {
      checkedCount++;
      const tripDoc = await db.collection("trips").doc(tripId).get();
      
      if (!tripDoc.exists) {
        const encryptionKeysRef = db.collection("trips").doc(tripId).collection("encryptionKeys");
        const encryptionKeysSnap = await encryptionKeysRef.get();
        
        if (!encryptionKeysSnap.empty) {
          const batch = db.batch();
          encryptionKeysSnap.docs.forEach((doc) => {
            batch.delete(doc.ref);
          });
          await batch.commit();
          cleanedCount += encryptionKeysSnap.docs.length;
          logInfo("Cleaned up orphaned encryptionKeys", { tripId, count: encryptionKeysSnap.docs.length });
        }
      }
    }

    logFunctionSuccess("cleanupOrphanedEncryptionKeys", uid, {
      checkedTrips: checkedCount,
      cleanedKeys: cleanedCount,
    });

    return {
      success: true,
      checkedTrips: checkedCount,
      cleanedKeys: cleanedCount,
    };
  } catch (error) {
    logFunctionError("cleanupOrphanedEncryptionKeys", uid, error);
    throw new HttpsError("internal", "Failed to cleanup orphaned encryption keys", error);
  }
});
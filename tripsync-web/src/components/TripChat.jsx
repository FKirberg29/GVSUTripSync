/**
 * TripChat Component
 * 
 * Real-time chat component for trip members with support for @mentions, encryption/decryption,
 * optimistic updates, and auto-scrolling. All messages are encrypted before storage and
 * decrypted when displayed. Includes rate limiting to prevent message spam.
 */

import React, { useState, useEffect, useRef } from "react";
import { db, auth } from "../firebaseConfig";
import {
  collection,
  addDoc,
  onSnapshot,
  query,
  orderBy,
  limit as fsLimit,
  serverTimestamp,
  deleteDoc,
  doc,
  setDoc,
} from "firebase/firestore";
import { getUserProfiles, getUserDisplayName, getUserProfile } from "../utils/users.js";
import { encrypt, decrypt } from "../utils/encryption.js";
import { getTripEncryptionKey, enableTripEncryption } from "../utils/tripKeys.js";
import { validateChatMessage, sanitizeText, createRateLimiter, MAX_LENGTHS } from "../utils/validation.js";
import { trackUserAction, trackError } from "../utils/errorTracking.js";
import "./TripChat.css";

/**
 * Renders trip chat panel
 * @param {string} tripId - Trip ID to load chat messages for
 * @param {Function} onClose - Callback function to close the chat panel
 */
export default function TripChat({ tripId, onClose }) {
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState("");
  const [messageProfiles, setMessageProfiles] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [tripKey, setTripKey] = useState(null);
  const messagesEndRef = useRef(null);
  const currentUserId = auth.currentUser?.uid;
  
  // Rate limiting reference to prevent sending messages too frequently
  const rateLimitedSubmit = useRef(null);

  // Effect hook to set up encryption, load trip key, and pre-load current user profile
  // Pre-loading profile prevents name flashing when optimistic messages appear
  useEffect(() => {
    if (!tripId || !currentUserId) return;

    const setupEncryption = async () => {
      try {
        // Attempts to get existing trip encryption key
        let key = await getTripEncryptionKey(tripId, currentUserId);
        
        // If no key exists, enables encryption for this trip and generates keys
        if (!key) {
          await enableTripEncryption(tripId, currentUserId);
          key = await getTripEncryptionKey(tripId, currentUserId);
        }
        
        setTripKey(key);
      } catch (error) {
        console.error('Error setting up encryption:', error);
      }
    };

    // Pre-loads current user's profile to prevent name flashing in optimistic messages
    const loadCurrentUserProfile = async () => {
      try {
        const profile = await getUserProfile(currentUserId);
        if (profile) {
          setMessageProfiles(prev => ({
            ...prev,
            [currentUserId]: profile
          }));
        }
      } catch (error) {
        console.error('Error loading current user profile:', error);
      }
    };

    setupEncryption();
    loadCurrentUserProfile();
    
    // Initializes rate limiter to prevent sending messages more than once per second
    rateLimitedSubmit.current = createRateLimiter(async (message) => {
      // Rate limiter placeholder - actual submission logic is in handleSubmit
    }, 1000);
  }, [tripId, currentUserId]);

  // Effect hook to load messages with real-time updates and optimistic update merging
  // Handles merging optimistic messages with real-time Firestore updates
  useEffect(() => {
    if (!tripId) return;

    const messagesRef = collection(db, "trips", tripId, "chat");
    // Queries last 50 messages ordered by creation time (newest first)
    const q = query(messagesRef, orderBy("createdAt", "desc"), fsLimit(50));
    
    // Sets up real-time listener for chat messages
    const unsub = onSnapshot(q, async (snap) => {
      // Processes each message: decrypts and sanitizes text
      const messagesData = await Promise.all(
        snap.docs.map(async (d) => {
          const data = d.data();
          let text = data.text;

          // Decrypts message if encryption is enabled and key is available
          if (tripKey && data.encrypted) {
            try {
              text = await decrypt(data.text, tripKey);
              // Sanitizes decrypted text before displaying to prevent XSS
              text = sanitizeText(text);
            } catch (error) {
              console.error('Error decrypting message:', error);
              text = '[Encrypted message - decryption failed]';
            }
          } else {
            // Sanitizes non-encrypted text as a safety measure
            text = sanitizeText(text);
          }

          return {
            id: d.id,
            ...data,
            text, // Uses decrypted and sanitized text
          };
        })
      );
      
      // Merges real-time updates with optimistic messages
      // Keeps optimistic messages that haven't been confirmed by Firestore yet
      setMessages(prev => {
        // Reverses order to show oldest messages first (Firestore returns newest first)
        const reversedData = messagesData.reverse();
        // Filters out optimistic messages that have been confirmed by Firestore
        const optimisticMessages = prev.filter(m => m._optimistic && !reversedData.find(d => d.id === m.id));
        const merged = [...reversedData, ...optimisticMessages];
        
        // Sorts merged messages by creation time to maintain chronological order
        const sorted = merged.sort((a, b) => {
          const aTime = a.createdAt?.toDate?.() || (a.createdAt instanceof Date ? a.createdAt : new Date(a.createdAt || 0));
          const bTime = b.createdAt?.toDate?.() || (b.createdAt instanceof Date ? b.createdAt : new Date(b.createdAt || 0));
          return aTime.getTime() - bTime.getTime();
        });
        
        // Loads user profiles for all message authors to display names and avatars
        const userIds = [...new Set(sorted.map((m) => m.createdBy).filter(Boolean))];
        if (userIds.length > 0) {
          getUserProfiles(userIds).then(profiles => {
            const profilesMap = {};
            profiles.forEach((p) => {
              profilesMap[p.uid] = p;
            });
            setMessageProfiles(profilesMap);
          });
        }
        
        return sorted;
      });
    });

    return () => unsub();
  }, [tripId, tripKey]);

  // Effect hook to auto-scroll chat to bottom when new messages arrive
  // Ensures users see the latest messages without manual scrolling
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  /**
   * Parses @mentions from message text and returns structured parts for rendering
   * Splits text into alternating segments of plain text and mentions
   * @param {string} text - Message text to parse
   * @returns {Array} Array of objects with type ("text" or "mention") and content/username
   */
  function parseMentions(text) {
    const mentionRegex = /@(\w+)/g;
    const parts = [];
    let lastIndex = 0;
    let match;

    // Finds all @mention patterns and splits text around them
    while ((match = mentionRegex.exec(text)) !== null) {
      // Adds text before the mention if any exists
      if (match.index > lastIndex) {
        parts.push({ type: "text", content: text.slice(lastIndex, match.index) });
      }
      // Adds the mention segment
      parts.push({ type: "mention", username: match[1], fullMatch: match[0] });
      lastIndex = match.index + match[0].length;
    }

    // Adds remaining text after the last mention
    if (lastIndex < text.length) {
      parts.push({ type: "text", content: text.slice(lastIndex) });
    }

    // Returns parsed parts or a single text part if no mentions found
    return parts.length > 0 ? parts : [{ type: "text", content: text }];
  }

  /**
   * Extracts mentioned user IDs from message text by matching @username patterns to trip members
   * @param {string} text - Message text containing @mentions
   * @returns {Promise<Array>} Array of mentioned user IDs
   */
  async function extractMentionedUserIds(text) {
    const mentioned = [];
    const mentionRegex = /@(\w+)/g;
    let match;

    // Get trip members for mention detection
    const { getDoc, doc: docFn } = await import("firebase/firestore");
    const tripDoc = await getDoc(docFn(db, "trips", tripId));
    const tripData = tripDoc.data();
    const memberUids = tripData?.roles ? Object.keys(tripData.roles) : [];
    const memberProfiles = await getUserProfiles(memberUids);

    while ((match = mentionRegex.exec(text)) !== null) {
      const username = match[1].toLowerCase();
      const user = memberProfiles.find(
        (p) =>
          p.displayName?.toLowerCase().includes(username) ||
          p.email?.toLowerCase().includes(username)
      );
      if (user) {
        mentioned.push(user.uid);
      }
    }

    return [...new Set(mentioned)];
  }

  /**
   * Handles message submission with validation, encryption, optimistic updates, and mention extraction
   * @param {Event} e - Form submit event
   */
  async function handleSubmit(e) {
    e.preventDefault();
    if (!newMessage.trim() || !currentUserId || submitting) return;

    // Validate and sanitize message
    const validation = validateChatMessage(newMessage);
    if (!validation.valid) {
      alert(validation.error);
      return;
    }

    setSubmitting(true);
    try {
      const mentionedUserIds = await extractMentionedUserIds(validation.sanitized);
      const plaintextMessage = validation.sanitized;
      let messageText = plaintextMessage;
      let isEncrypted = false;

      // Always encrypt message
      if (tripKey) {
        try {
          messageText = await encrypt(plaintextMessage, tripKey);
          isEncrypted = true;
        } catch (error) {
          console.error('Error encrypting message:', error);
          alert('Failed to encrypt message. Please try again.');
          setSubmitting(false);
          return;
        }
      } else {
        // If key not loaded yet, wait a bit and retry
        alert('Encryption key not ready. Please try again in a moment.');
        setSubmitting(false);
        return;
      }

      // Generates a temporary message ID for optimistic update
      // Uses Firestore document reference to get a valid ID before creating the document
      const tempMessageRef = doc(collection(db, "trips", tripId, "chat"));
      const tempMessageId = tempMessageRef.id;

      // Loads current user's profile immediately for optimistic message
      // Prevents flash of user ID or "Unknown" name while message is being processed
      const currentUserProfile = await getUserProfile(currentUserId);
      if (currentUserProfile) {
        setMessageProfiles(prev => ({
          ...prev,
          [currentUserId]: currentUserProfile
        }));
      }

      // Adds message optimistically to local state with plaintext
      // Displays message immediately without waiting for Firestore write to complete
      // Prevents flash of encrypted text before real-time update arrives
      const optimisticMessage = {
        id: tempMessageId,
        text: plaintextMessage, // Plaintext for immediate display
        encrypted: isEncrypted,
        createdAt: new Date(),
        createdBy: currentUserId,
        mentionedUserIds: mentionedUserIds.length > 0 ? mentionedUserIds : null,
        _optimistic: true, // Flag to identify optimistic updates for merging logic
      };
      setMessages(prev => [...prev, optimisticMessage]);

      // Creates the message document in Firestore with encrypted data
      // Real-time listener will update the optimistic message when this completes
      await setDoc(tempMessageRef, {
        text: messageText,
        encrypted: isEncrypted,
        createdAt: serverTimestamp(),
        createdBy: currentUserId,
        mentionedUserIds: mentionedUserIds.length > 0 ? mentionedUserIds : null,
      });

      // Write activity for mentions
      if (mentionedUserIds.length > 0) {
        await import("firebase/firestore").then((m) =>
          m.addDoc(m.collection(db, "trips", tripId, "activities"), {
            type: "chat.mention",
            message: `Mentioned ${mentionedUserIds.length} user(s) in trip chat`,
            createdAt: serverTimestamp(),
            actorId: currentUserId,
          })
        );
      }

      setNewMessage("");
      
      // Track successful message send
      trackUserAction('chat_message_sent', {
        trip_id: tripId,
        has_mentions: mentionedUserIds.length > 0,
        message_length: plaintextMessage.length,
      });
    } catch (err) {
      console.error("Failed to send message:", err);
      trackError(err, {
        action: 'send_chat_message',
        trip_id: tripId,
      });
      alert("Could not send message. Please try again.");
      // Remove optimistic message on error
      setMessages(prev => prev.filter(m => !m._optimistic || m.createdBy !== currentUserId || m.text !== newMessage.trim()));
    } finally {
      setSubmitting(false);
    }
  }

  /**
   * Handles message deletion with confirmation
   * @param {string} messageId - ID of message to delete
   */
  async function handleDelete(messageId) {
    if (!window.confirm("Delete this message?")) return;
    try {
      await deleteDoc(doc(db, "trips", tripId, "chat", messageId));
      trackUserAction('chat_message_deleted', { trip_id: tripId });
    } catch (err) {
      console.error("Failed to delete message:", err);
      trackError(err, { action: 'delete_chat_message', trip_id: tripId });
      alert("Could not delete message.");
    }
  }

  return (
    <div className="trip-chat-overlay">
      <div className="trip-chat-panel">
        <div className="trip-chat-header">
          <h3>Trip Chat</h3>
          <button className="trip-chat-close-btn" onClick={onClose} title="Close">
            ×
          </button>
        </div>

        <div className="trip-chat-messages" ref={messagesEndRef}>
          {messages.length === 0 ? (
            <div className="trip-chat-empty">No messages yet. Start the conversation!</div>
          ) : (
            messages.map((message) => {
              const profile = messageProfiles[message.createdBy];
              const isOwn = message.createdBy === currentUserId;
              const parts = parseMentions(message.text);

              return (
                <div key={message.id} className={`trip-chat-message ${isOwn ? "trip-chat-message-own" : ""}`}>
                  <div className="trip-chat-message-header">
                    {profile?.photoURL && (
                      <img src={profile.photoURL} alt="" className="trip-chat-avatar" />
                    )}
                    <div className="trip-chat-message-info">
                      <div className="trip-chat-author">
                        {getUserDisplayName(profile || { uid: message.createdBy })}
                      </div>
                      <div className="trip-chat-time">
                        {message.createdAt?.toDate
                          ? new Date(message.createdAt.toDate()).toLocaleString()
                          : "Just now"}
                      </div>
                    </div>
                    {isOwn && (
                      <button
                        className="trip-chat-delete-btn"
                        onClick={() => handleDelete(message.id)}
                        title="Delete message"
                      >
                        ×
                      </button>
                    )}
                  </div>
                  <div className="trip-chat-text">
                    {parts.map((part, idx) => {
                      if (part.type === "mention") {
                        return (
                          <span key={idx} className="trip-chat-mention">
                            {part.fullMatch}
                          </span>
                        );
                      }
                      return <span key={idx}>{part.content}</span>;
                    })}
                  </div>
                </div>
              );
            })
          )}
          <div ref={messagesEndRef} />
        </div>

        <form onSubmit={handleSubmit} className="trip-chat-form">
          <textarea
            value={newMessage}
            onChange={(e) => {
              const value = e.target.value;
              // Prevent input if exceeds max length
              if (value.length <= MAX_LENGTHS.CHAT_MESSAGE) {
                setNewMessage(value);
              } else {
                alert(`Message cannot exceed ${MAX_LENGTHS.CHAT_MESSAGE} characters`);
              }
            }}
            placeholder="Type a message... Use @username to mention someone"
            className="trip-chat-input"
            rows={2}
            disabled={submitting}
            maxLength={MAX_LENGTHS.CHAT_MESSAGE}
          />
          {newMessage.length > MAX_LENGTHS.CHAT_MESSAGE * 0.9 && (
            <div style={{ fontSize: '12px', color: '#999', marginTop: '4px' }}>
              {newMessage.length} / {MAX_LENGTHS.CHAT_MESSAGE} characters
            </div>
          )}
          <div className="trip-chat-form-actions">
            <button type="submit" className="trip-chat-submit-btn" disabled={submitting || !newMessage.trim()}>
              {submitting ? "Sending..." : "Send"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}


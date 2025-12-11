/**
 * Comments Component
 * 
 * Comment system for itinerary items with support for @mentions, encryption/decryption,
 * user profiles, and real-time updates. All comments are encrypted before storage and
 * decrypted when displayed.
 */

import React, { useState, useEffect, useRef } from "react";
import { db, auth } from "../firebaseConfig";
import {
  collection,
  addDoc,
  onSnapshot,
  query,
  orderBy,
  serverTimestamp,
  deleteDoc,
  doc,
} from "firebase/firestore";
import { getUserProfiles, getUserDisplayName } from "../utils/users.js";
import { encrypt, decrypt } from "../utils/encryption.js";
import { getTripEncryptionKey, enableTripEncryption } from "../utils/tripKeys.js";
import { validateComment, sanitizeText, MAX_LENGTHS } from "../utils/validation.js";
import { trackUserAction, trackError } from "../utils/errorTracking.js";
import "./Comments.css";

/**
 * Renders comments panel for an itinerary item
 * @param {string} tripId - Trip ID
 * @param {string} itemId - Itinerary item ID to load comments for
 * @param {Function} onClose - Callback function to close the comments panel
 */
export default function Comments({ tripId, itemId, onClose }) {
  const [comments, setComments] = useState([]);
  const [newComment, setNewComment] = useState("");
  const [commentProfiles, setCommentProfiles] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [tripKey, setTripKey] = useState(null);
  const textareaRef = useRef(null);
  const currentUserId = auth.currentUser?.uid;

  // Effect hook to set up encryption and load the trip encryption key
  // Ensures encryption is enabled for the trip and the key is available for decrypting existing comments
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

    setupEncryption();
  }, [tripId, currentUserId]);

  // Effect hook to load comments with real-time updates
  // Sets up Firestore listener for comments collection, decrypts comments on load,
  // and loads user profiles for all comment authors
  useEffect(() => {
    if (!tripId || !itemId) return;

    const commentsRef = collection(db, "trips", tripId, "itinerary", itemId, "comments");
    // Queries comments ordered by creation time (oldest first)
    const q = query(commentsRef, orderBy("createdAt", "asc"));
    
    // Sets up real-time listener for comments changes
    const unsub = onSnapshot(
      q,
      async (snap) => {
        // Processes each comment document: decrypts and sanitizes text
        const commentsData = await Promise.all(
          snap.docs.map(async (d) => {
            const data = d.data();
            let text = data.text;

            // Decrypts comment if encryption is enabled and key is available
            if (tripKey && data.encrypted) {
              try {
                text = await decrypt(data.text, tripKey);
                // Sanitizes decrypted text before displaying to prevent XSS
                text = sanitizeText(text);
              } catch (error) {
                console.error('Error decrypting comment:', error);
                text = '[Encrypted comment - decryption failed]';
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
        setComments(commentsData);

        // Loads user profiles for all comment authors to display names and avatars
        const userIds = [...new Set(commentsData.map((c) => c.createdBy).filter(Boolean))];
        if (userIds.length > 0) {
          try {
            const profiles = await getUserProfiles(userIds);
            const profilesMap = {};
            profiles.forEach((p) => {
              profilesMap[p.uid] = p;
            });
            setCommentProfiles(profilesMap);
          } catch (err) {
            console.error("Failed to load comment profiles:", err);
          }
        }
      },
      (error) => {
        console.error("Error loading comments:", error);
        console.error("Error details:", {
          code: error.code,
          message: error.message,
          tripId,
          itemId,
        });
        // Handles missing Firestore index error
        if (error.code === "failed-precondition") {
          console.error("Firestore index may be missing. Check the console for index creation link.");
        }
      }
    );

    return () => unsub();
  }, [tripId, itemId, tripKey]);

  // Effect hook to auto-focus the comment textarea when the panel opens
  // Allows immediate typing without clicking
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.focus();
    }
  }, []);

  /**
   * Parses @mentions from comment text and returns structured parts for rendering
   * Splits text into alternating segments of plain text and mentions
   * @param {string} text - Comment text to parse
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
   * Extracts mentioned user IDs from comment text by matching @username patterns to trip members
   * Matches @mentions to actual trip members by comparing against display names and emails
   * @param {string} text - Comment text containing @mentions
   * @returns {Promise<Array>} Array of unique mentioned user IDs
   */
  async function extractMentionedUserIds(text) {
    try {
      const mentioned = [];
      const mentionRegex = /@(\w+)/g;
      let match;

      // Fetches trip document to get list of member UIDs
      const { getDoc, doc: docFn } = await import("firebase/firestore");
      const tripDoc = await getDoc(docFn(db, "trips", tripId));
      if (!tripDoc.exists()) {
        console.warn("Trip document not found for mention extraction");
        return [];
      }
      const tripData = tripDoc.data();
      const memberUids = tripData?.roles ? Object.keys(tripData.roles) : [];
      if (memberUids.length === 0) {
        return [];
      }
      
      // Loads profiles for all trip members to match against mentions
      const memberProfiles = await getUserProfiles(memberUids);

      // Finds all @mention patterns and matches them to trip members
      while ((match = mentionRegex.exec(text)) !== null) {
        const username = match[1].toLowerCase();
        // Matches mention to user by checking if display name or email contains the username
        const user = memberProfiles.find(
          (p) =>
            p.displayName?.toLowerCase().includes(username) ||
            p.email?.toLowerCase().includes(username)
        );
        if (user) {
          mentioned.push(user.uid);
        }
      }

      // Returns unique user IDs (in case someone is mentioned multiple times)
      return [...new Set(mentioned)];
    } catch (err) {
      console.error("Error extracting mentioned user IDs:", err);
      // Does not block comment submission if mention extraction fails
      return [];
    }
  }

  /**
   * Handles comment submission with validation, encryption, and mention extraction
   * Validates input, extracts mentions, encrypts comment, saves to Firestore,
   * and creates activity log entry for mentions
   * @param {Event} e - Form submit event
   */
  async function handleSubmit(e) {
    e.preventDefault();
    if (!newComment.trim() || !currentUserId || submitting) return;

    // Validates and sanitizes comment input
    const validation = validateComment(newComment);
    if (!validation.valid) {
      alert(validation.error);
      return;
    }

    setSubmitting(true);
    try {
      console.log("Submitting comment:", { tripId, itemId, currentUserId });
      
      // Extracts mentioned user IDs from comment text before encryption
      const mentionedUserIds = await extractMentionedUserIds(validation.sanitized);
      console.log("Mentioned user IDs:", mentionedUserIds);

      let commentText = validation.sanitized;
      let isEncrypted = false;

      // Encrypts comment before storing in Firestore
      if (tripKey) {
        try {
          commentText = await encrypt(commentText, tripKey);
          isEncrypted = true;
        } catch (error) {
          console.error('Error encrypting comment:', error);
          alert('Failed to encrypt comment. Please try again.');
          setSubmitting(false);
          return;
        }
      } else {
        // Prevents submission if encryption key is not ready
        alert('Encryption key not ready. Please try again in a moment.');
        setSubmitting(false);
        return;
      }

      // Saves encrypted comment to Firestore
      const commentRef = collection(db, "trips", tripId, "itinerary", itemId, "comments");
      const docRef = await addDoc(commentRef, {
        text: commentText,
        encrypted: isEncrypted,
        createdAt: serverTimestamp(),
        createdBy: currentUserId,
        mentionedUserIds: mentionedUserIds.length > 0 ? mentionedUserIds : null,
      });
      console.log("Comment added successfully:", docRef.id);

      // Creates activity log entry when users are mentioned
      if (mentionedUserIds.length > 0) {
        const { addDoc: addDocFn, collection: collectionFn } = await import("firebase/firestore");
        await addDocFn(collectionFn(db, "trips", tripId, "activities"), {
          type: "comment.mention",
          message: `Mentioned ${mentionedUserIds.length} user(s) in a comment`,
          createdAt: serverTimestamp(),
          actorId: currentUserId,
          itemId,
        });
      }

      setNewComment("");
      
      // Tracks successful comment submission for analytics
      trackUserAction('comment_posted', {
        trip_id: tripId,
        item_id: itemId,
        has_mentions: mentionedUserIds.length > 0,
        comment_length: validation.sanitized.length,
      });
    } catch (err) {
      console.error("Failed to add comment:", err);
      trackError(err, {
        action: 'post_comment',
        trip_id: tripId,
        item_id: itemId,
      });
      alert(`Could not add comment: ${err.message || "Please try again."}`);
    } finally {
      setSubmitting(false);
    }
  }

  /**
   * Handles comment deletion with confirmation
   * @param {string} commentId - ID of comment to delete
   */
  async function handleDelete(commentId) {
    if (!window.confirm("Delete this comment?")) return;
    try {
      await deleteDoc(doc(db, "trips", tripId, "itinerary", itemId, "comments", commentId));
      trackUserAction('comment_deleted', { trip_id: tripId, item_id: itemId });
    } catch (err) {
      console.error("Failed to delete comment:", err);
      trackError(err, { action: 'delete_comment', trip_id: tripId, item_id: itemId });
      alert("Could not delete comment.");
    }
  }

  return (
    <div className="comments-overlay">
      <div className="comments-panel">
        <div className="comments-header">
          <h3>Comments</h3>
          <button className="comments-close-btn" onClick={onClose} title="Close">
            ×
          </button>
        </div>

        <div className="comments-list">
          {comments.length === 0 ? (
            <div className="comments-empty">No comments yet. Be the first to comment!</div>
          ) : (
            comments.map((comment) => {
              const profile = commentProfiles[comment.createdBy];
              const isOwn = comment.createdBy === currentUserId;
              const parts = parseMentions(comment.text);

              return (
                <div key={comment.id} className="comments-item">
                  <div className="comments-item-header">
                    {profile?.photoURL && (
                      <img src={profile.photoURL} alt="" className="comments-avatar" />
                    )}
                    <div className="comments-item-info">
                      <div className="comments-author">
                        {getUserDisplayName(profile || { uid: comment.createdBy })}
                      </div>
                      <div className="comments-time">
                        {comment.createdAt?.toDate
                          ? new Date(comment.createdAt.toDate()).toLocaleString()
                          : "Just now"}
                      </div>
                    </div>
                    {isOwn && (
                      <button
                        className="comments-delete-btn"
                        onClick={() => handleDelete(comment.id)}
                        title="Delete comment"
                      >
                        ×
                      </button>
                    )}
                  </div>
                  <div className="comments-text">
                    {parts.map((part, idx) => {
                      if (part.type === "mention") {
                        return (
                          <span key={idx} className="comments-mention">
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
        </div>

        <form onSubmit={handleSubmit} className="comments-form">
          <textarea
            ref={textareaRef}
            value={newComment}
            onChange={(e) => {
              const value = e.target.value;
              // Prevent input if exceeds max length
              if (value.length <= MAX_LENGTHS.COMMENT) {
                setNewComment(value);
              } else {
                alert(`Comment cannot exceed ${MAX_LENGTHS.COMMENT} characters`);
              }
            }}
            placeholder="Add a comment... Use @username to mention someone"
            className="comments-input"
            rows={3}
            disabled={submitting}
            maxLength={MAX_LENGTHS.COMMENT}
          />
          {newComment.length > MAX_LENGTHS.COMMENT * 0.9 && (
            <div style={{ fontSize: '12px', color: '#999', marginTop: '4px' }}>
              {newComment.length} / {MAX_LENGTHS.COMMENT} characters
            </div>
          )}
          <div className="comments-form-actions">
            <button type="submit" className="comments-submit-btn" disabled={submitting || !newComment.trim()}>
              {submitting ? "Posting..." : "Post"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}


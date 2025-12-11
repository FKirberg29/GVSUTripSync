/**
 * MembersOverlay Component
 * 
 * Overlay wrapper for the TripMembersPanel component that displays it in a modal overlay.
 * Provides a backdrop and close button for viewing trip members and sending invitations.
 */

import TripMembersPanel from "./TripMembersPanel.jsx";

export default function MembersOverlay({ tripId, onClose }) {
  return (
    <div
      className="td-overlay"
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.4)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
      }}
      onClick={onClose}
    >
      <div
        className="td-overlay-card"
        style={{
          width: "min(900px, 92vw)",
          maxHeight: "90vh",
          overflow: "auto",
          background: "#fff",
          borderRadius: 12,
          boxShadow: "0 10px 30px rgba(0,0,0,0.2)",
          padding: 16,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: "flex", alignItems: "center", marginBottom: 12 }}>
          <h3 style={{ margin: 0, fontSize: 18, fontWeight: 600 }}>Members & Invite</h3>
          <button className="td-btn" style={{ marginLeft: "auto" }} onClick={onClose}>
            Close
          </button>
        </div>

        <TripMembersPanel tripId={tripId} />
      </div>
    </div>
  );
}



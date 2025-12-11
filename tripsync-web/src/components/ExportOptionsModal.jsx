/**
 * ExportOptionsModal Component
 * 
 * Modal dialog for selecting export options for a trip.
 * Provides buttons to export the trip as an Excel file or PDF document.
 */

import React from "react";
import "./ExportOptionsModal.css";

/**
 * Renders export options modal
 * @param {boolean} isOpen - Whether the modal is open
 * @param {Function} onClose - Callback function to close the modal
 * @param {Function} onExportExcel - Callback function to export as Excel
 * @param {Function} onExportPDF - Callback function to export as PDF
 * @param {boolean} exporting - Whether an export is currently in progress
 */
export default function ExportOptionsModal({ isOpen, onClose, onExportExcel, onExportPDF, exporting }) {
  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content export-options-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Export Options</h2>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        
        <div className="modal-body">
          <div className="export-options-list">
            <button
              className="export-option-button"
              onClick={onExportExcel}
              disabled={exporting}
            >
              <div className="export-option-icon excel-icon">Excel</div>
              <div className="export-option-content">
                <div className="export-option-title">Export Trip (Excel)</div>
                <div className="export-option-description">Export this trip as an Excel file</div>
              </div>
              {exporting && <div className="export-option-loading">...</div>}
            </button>

            <button
              className="export-option-button"
              onClick={onExportPDF}
              disabled={exporting}
            >
              <div className="export-option-icon pdf-icon">PDF</div>
              <div className="export-option-content">
                <div className="export-option-title">Export Trip (PDF)</div>
                <div className="export-option-description">Export this trip as a formatted PDF document</div>
              </div>
              {exporting && <div className="export-option-loading">...</div>}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}


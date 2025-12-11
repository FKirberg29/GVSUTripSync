/**
 * PDF Export Utilities
 * 
 * Provides functionality to export trip data as PDF files using jsPDF.
 * Creates formatted PDF documents with trip itinerary and scrapbook content.
 * Uses lazy loading for PDF libraries to avoid breaking the app if they fail.
 * All encrypted data is decrypted before export.
 */

import { exportTripAsJSON } from "./export.js";

// Lazy loads PDF libraries to avoid breaking the app if they fail to load
let jsPDF = null;
let loadPDFLibs = async () => {
  if (jsPDF) return true;
  try {
    const jsPDFModule = await import("jspdf");
    jsPDF = jsPDFModule.default || jsPDFModule;
    return true;
  } catch (error) {
    console.error("Failed to load jsPDF:", error);
    throw new Error("PDF export is not available. Please refresh the page.");
  }
};

/**
 * Exports a trip as a PDF document with itinerary and scrapbook content
 * Creates formatted PDF with pagination and proper layout
 * @param {string} tripId - Trip ID to export
 * @param {string} tripName - Trip name for file naming
 */
export async function exportTripAsPDF(tripId, tripName) {
  try {
    // Load PDF libraries
    const loaded = await loadPDFLibs();
    if (!loaded) {
      throw new Error("PDF library failed to load. Please refresh the page.");
    }

    // Get trip data
    const tripData = await exportTripAsJSON(tripId);

    // Create PDF
    const pdf = new jsPDF({
      orientation: "portrait",
      unit: "mm",
      format: "a4",
    });

    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const margin = 15;
    let yPos = margin;

    // Helper function to add new page if needed
    const checkNewPage = (requiredHeight) => {
      if (yPos + requiredHeight > pageHeight - margin) {
        pdf.addPage();
        yPos = margin;
        return true;
      }
      return false;
    };

    // Title
    pdf.setFontSize(20);
    pdf.setFont("helvetica", "bold");
    pdf.text(tripName || "Trip", margin, yPos);
    yPos += 10;

    // Trip metadata
    pdf.setFontSize(12);
    pdf.setFont("helvetica", "normal");
    if (tripData.trip.startDate) {
      // Handle both ISO string and Firestore timestamp formats
      let startDate;
      if (typeof tripData.trip.startDate === 'string') {
        startDate = new Date(tripData.trip.startDate).toLocaleDateString();
      } else if (tripData.trip.startDate.seconds) {
        startDate = new Date(tripData.trip.startDate.seconds * 1000).toLocaleDateString();
      } else if (tripData.trip.startDate.toDate) {
        startDate = tripData.trip.startDate.toDate().toLocaleDateString();
      } else {
        startDate = new Date(tripData.trip.startDate).toLocaleDateString();
      }
      if (startDate && startDate !== 'Invalid Date') {
        pdf.text(`Start Date: ${startDate}`, margin, yPos);
        yPos += 6;
      }
    }
    if (tripData.trip.endDate) {
      // Handle both ISO string and Firestore timestamp formats
      let endDate;
      if (typeof tripData.trip.endDate === 'string') {
        endDate = new Date(tripData.trip.endDate).toLocaleDateString();
      } else if (tripData.trip.endDate.seconds) {
        endDate = new Date(tripData.trip.endDate.seconds * 1000).toLocaleDateString();
      } else if (tripData.trip.endDate.toDate) {
        endDate = tripData.trip.endDate.toDate().toLocaleDateString();
      } else {
        endDate = new Date(tripData.trip.endDate).toLocaleDateString();
      }
      if (endDate && endDate !== 'Invalid Date') {
        pdf.text(`End Date: ${endDate}`, margin, yPos);
        yPos += 6;
      }
    }
    if (tripData.trip.category) {
      pdf.text(`Category: ${tripData.trip.category}`, margin, yPos);
      yPos += 6;
    }
    yPos += 5;

    // Itinerary section
    checkNewPage(15);
    pdf.setFontSize(16);
    pdf.setFont("helvetica", "bold");
    pdf.text("Itinerary", margin, yPos);
    yPos += 8;

    // Group items by day
    const itemsByDay = {};
    tripData.trip.itinerary.forEach((item) => {
      const day = item.day || 1;
      if (!itemsByDay[day]) {
        itemsByDay[day] = [];
      }
      itemsByDay[day].push(item);
    });

    // Add itinerary items
    Object.keys(itemsByDay)
      .sort((a, b) => parseInt(a) - parseInt(b))
      .forEach((day) => {
        checkNewPage(20);
        pdf.setFontSize(14);
        pdf.setFont("helvetica", "bold");
        pdf.text(`Day ${day}`, margin, yPos);
        yPos += 7;

        itemsByDay[day].forEach((item) => {
          checkNewPage(25);

          // Item title
          pdf.setFontSize(12);
          pdf.setFont("helvetica", "bold");
          const title = item.title || "Untitled Stop";
          pdf.text(title, margin + 5, yPos);
          yPos += 6;

          // Item address (only show if it's a valid decrypted string, not encrypted data)
          if (item.address && typeof item.address === 'string') {
            // First, check for specific weird symbols that suggest encoding issues
            const hasWeirdSymbols = /[ØÜÍ]/.test(item.address);
            
            // Check if address looks like encrypted data (base64-like)
            // Encrypted addresses are typically base64 strings, so check for that pattern
            const isLikelyEncrypted = /^[A-Za-z0-9+/=]+$/.test(item.address) && item.address.length > 50;
            
            // Check for any non-ASCII printable characters
            // Exclude the specific problematic symbols
            const hasNonASCII = /[^\x20-\x7E]/.test(item.address);
            
            // Check if address has characters that are spaced out weirdly (suggests binary interpretation)
            const hasSpacedOutChars = item.address.length > 20 && 
                                      item.address.split('').filter(c => {
                                        const code = c.charCodeAt(0);
                                        return (code < 32 || code > 126) && code !== 160;
                                      }).length > item.address.length * 0.1;
            
            // If it has the specific weird symbols, definitely skip it
            if (hasWeirdSymbols) {
              // Skip this address - it's corrupted/encrypted
            } else if (!isLikelyEncrypted && !hasSpacedOutChars) {
              pdf.setFontSize(10);
              pdf.setFont("helvetica", "normal");
              // Clean the address - remove any non-printable characters and weird symbols
              // Only allow ASCII printable characters (32-126)
              const cleanAddress = item.address
                .replace(/[^\x20-\x7E]/g, '') // Remove ALL non-ASCII characters
                .replace(/\s+/g, ' ') // Normalize whitespace
                .trim();
              
              // Only show if it looks like a real address (has letters, reasonable length, no weird patterns)
              if (cleanAddress && 
                  cleanAddress.length > 5 && 
                  cleanAddress.length < 200 && // Reasonable address length
                  /[A-Za-z]/.test(cleanAddress) && // Has letters
                  !/^[0-9\s]+$/.test(cleanAddress)) { // Not just numbers and spaces
                pdf.text(`📍 ${cleanAddress}`, margin + 5, yPos);
                yPos += 5;
              }
            }
          }

          // Item notes
          if (item.notes) {
            pdf.setFontSize(10);
            pdf.setFont("helvetica", "italic");
            const notesLines = pdf.splitTextToSize(item.notes, pageWidth - margin * 2 - 10);
            pdf.text(notesLines, margin + 5, yPos);
            yPos += notesLines.length * 5;
          }

          yPos += 3;
        });
      });

    // Footer
    const totalPages = pdf.internal.pages.length - 1;
    for (let i = 1; i <= totalPages; i++) {
      pdf.setPage(i);
      pdf.setFontSize(8);
      pdf.setFont("helvetica", "italic");
      pdf.text(
        `Exported from TripSync on ${new Date().toLocaleDateString()}`,
        pageWidth / 2,
        pageHeight - 10,
        { align: "center" }
      );
      pdf.text(`Page ${i} of ${totalPages}`, pageWidth / 2, pageHeight - 5, {
        align: "center",
      });
    }

    // Save PDF
    const filename = `${tripName || "trip"}_export_${new Date().toISOString().split("T")[0]}.pdf`;
    pdf.save(filename);
  } catch (error) {
    console.error("Error exporting PDF:", error);
    throw error;
  }
}


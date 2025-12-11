/**
 * Excel Export Utilities
 * 
 * Provides functionality to export trip data as Excel (.xlsx) files using the
 * XLSX library. Creates formatted spreadsheets with multiple sheets including
 * trip overview, itinerary, comments, and travel diary entries. All encrypted
 * data is decrypted before export.
 */

import * as XLSX from "xlsx";
import { exportTripAsJSON, exportAllUserData } from "./export.js";

/**
 * Exports a trip as an Excel file with multiple formatted sheets
 * Creates workbook with overview, comments, and diary entries sheets
 * @param {string} tripId - Trip ID to export
 * @param {string} tripName - Trip name for file naming
 */
export async function exportTripAsExcel(tripId, tripName) {
  try {
    // Get trip data
    const tripData = await exportTripAsJSON(tripId);
    const trip = tripData.trip;

    // Create workbook
    const workbook = XLSX.utils.book_new();

    // Sheet 1: Trip Overview + Itinerary (combined)
    const overviewData = [
      ["Trip Name", trip.name || ""],
      ["Category", trip.category || ""],
      ["Start Date", trip.startDate ? new Date(trip.startDate).toLocaleDateString() : ""],
      ["End Date", trip.endDate ? new Date(trip.endDate).toLocaleDateString() : ""],
      ["Created", trip.createdAt ? new Date(trip.createdAt).toLocaleDateString() : ""],
      [], // Empty row separator
      ["Itinerary"], // Section header
      ["Day", "Title", "Address", "Notes", "Comments", "Diary Entries"],
    ];

    // Add itinerary items to the same sheet
    if (trip.itinerary && trip.itinerary.length > 0) {
      trip.itinerary.forEach((item) => {
        const commentsCount = item.comments?.length || 0;
        const diaryCount = item.diaryEntries?.length || 0;
        overviewData.push([
          item.day || "",
          item.title || "",
          item.address || "",
          item.notes || "",
          commentsCount > 0 ? `${commentsCount} comment${commentsCount === 1 ? "" : "s"}` : "",
          diaryCount > 0 ? `${diaryCount} entr${diaryCount === 1 ? "y" : "ies"}` : "",
        ]);
      });
    }

    const overviewSheet = XLSX.utils.aoa_to_sheet(overviewData);
    XLSX.utils.book_append_sheet(workbook, overviewSheet, "Overview");

    // Sheet 3: Comments
    const allComments = [];
    if (trip.itinerary) {
      trip.itinerary.forEach((item) => {
        if (item.comments && item.comments.length > 0) {
          item.comments.forEach((comment) => {
            allComments.push({
              "Itinerary Item": item.title || "",
              "Comment": comment.text || "",
              "Created By": comment.createdBy || "",
              "Date": comment.createdAt ? new Date(comment.createdAt).toLocaleString() : "",
            });
          });
        }
      });
    }

    if (allComments.length > 0) {
      const commentsSheet = XLSX.utils.json_to_sheet(allComments);
      XLSX.utils.book_append_sheet(workbook, commentsSheet, "Comments");
    }

    // Sheet 4: Diary Entries
    const allDiaryEntries = [];
    if (trip.itinerary) {
      trip.itinerary.forEach((item) => {
        if (item.diaryEntries && item.diaryEntries.length > 0) {
          item.diaryEntries.forEach((entry) => {
            allDiaryEntries.push({
              "Itinerary Item": item.title || "",
              "Notes": entry.notes || "",
              "Media Count": entry.mediaUrls?.length || 0,
              "Created By": entry.createdBy || "",
              "Date": entry.createdAt ? new Date(entry.createdAt).toLocaleString() : "",
            });
          });
        }
      });
    }

    if (allDiaryEntries.length > 0) {
      const diarySheet = XLSX.utils.json_to_sheet(allDiaryEntries);
      XLSX.utils.book_append_sheet(workbook, diarySheet, "Diary Entries");
    }

    // Sheet 4: Chat Messages
    if (trip.chat && trip.chat.length > 0) {
      const chatData = trip.chat.map((msg) => ({
        "Message": msg.text || "",
        "Created By": msg.createdBy || "",
        "Date": msg.createdAt ? new Date(msg.createdAt).toLocaleString() : "",
      }));
      const chatSheet = XLSX.utils.json_to_sheet(chatData);
      XLSX.utils.book_append_sheet(workbook, chatSheet, "Chat");
    }

    // Save file
    const filename = `${tripName || "trip"}_export_${new Date().toISOString().split("T")[0]}.xlsx`;
    XLSX.writeFile(workbook, filename);
  } catch (error) {
    console.error("Error exporting Excel:", error);
    throw error;
  }
}

/**
 * Export all user data as Excel
 */
export async function exportAllDataAsExcel() {
  try {
    // Get all user data
    const allData = await exportAllUserData();
    const user = allData.user;

    // Create workbook
    const workbook = XLSX.utils.book_new();

    // Sheet 1: User Profile
    const profileData = [
      ["User ID", user.uid || ""],
      ["Email", user.profile?.email || ""],
      ["Display Name", user.profile?.displayName || ""],
      ["Photo URL", user.profile?.photoURL || ""],
    ];
    const profileSheet = XLSX.utils.aoa_to_sheet(profileData);
    XLSX.utils.book_append_sheet(workbook, profileSheet, "Profile");

    // Sheet 2: All Trips Summary
    if (user.trips && user.trips.length > 0) {
      const tripsSummary = user.trips.map((trip) => ({
        "Trip Name": trip.name || "",
        "Category": trip.category || "",
        "Start Date": trip.startDate ? new Date(trip.startDate).toLocaleDateString() : "",
        "End Date": trip.endDate ? new Date(trip.endDate).toLocaleDateString() : "",
        "Itinerary Items": trip.itinerary?.length || 0,
        "Chat Messages": trip.chat?.length || 0,
        "Activities": trip.activities?.length || 0,
      }));
      const tripsSheet = XLSX.utils.json_to_sheet(tripsSummary);
      XLSX.utils.book_append_sheet(workbook, tripsSheet, "Trips Summary");
    }

    // Sheet 3: Friend Requests
    if (user.friendRequests && user.friendRequests.length > 0) {
      const friendRequestsData = user.friendRequests.map((req) => ({
        "From": req.fromUid || "",
        "To": req.toUid || "",
        "Status": req.status || "",
        "Date": req.createdAt ? new Date(req.createdAt).toLocaleString() : "",
      }));
      const friendRequestsSheet = XLSX.utils.json_to_sheet(friendRequestsData);
      XLSX.utils.book_append_sheet(workbook, friendRequestsSheet, "Friend Requests");
    }

    // Sheet 4: Friends
    if (user.friends && user.friends.length > 0) {
      const friendsData = user.friends.map((friendId) => ({
        "Friend ID": friendId,
      }));
      const friendsSheet = XLSX.utils.json_to_sheet(friendsData);
      XLSX.utils.book_append_sheet(workbook, friendsSheet, "Friends");
    }

    // Save file
    const filename = `tripsync_export_${new Date().toISOString().split("T")[0]}.xlsx`;
    XLSX.writeFile(workbook, filename);
  } catch (error) {
    console.error("Error exporting Excel:", error);
    throw error;
  }
}


/**
 * Google Drive API integration for backups
 * Uses Google Picker API for file selection and Drive API for uploads
 */

const GOOGLE_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY; // Reuse Maps API key if available
const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || "";

/**
 * Load Google APIs
 */
export async function loadGoogleAPIs() {
  return new Promise((resolve, reject) => {
    if (window.gapi && window.gapi.load) {
      window.gapi.load("picker", { callback: resolve, onerror: reject });
      return;
    }

    const script = document.createElement("script");
    script.src = "https://apis.google.com/js/api.js";
    script.onload = () => {
      window.gapi.load("picker", { callback: resolve, onerror: reject });
    };
    script.onerror = reject;
    document.head.appendChild(script);
  });
}

/**
 * Authenticate with Google (requires OAuth)
 */
export async function authenticateGoogle() {
  return new Promise((resolve, reject) => {
    if (!window.gapi || !window.gapi.auth2) {
      reject(new Error("Google APIs not loaded"));
      return;
    }

    window.gapi.auth2
      .getAuthInstance()
      .signIn({
        scope: "https://www.googleapis.com/auth/drive.file",
      })
      .then(resolve)
      .catch(reject);
  });
}

/**
 * Upload file to Google Drive
 */
export async function uploadToGoogleDrive(file, filename, mimeType = "application/json") {
  try {
    await loadGoogleAPIs();

    // Get access token
    const authInstance = window.gapi.auth2.getAuthInstance();
    const user = authInstance.currentUser.get();
    const authResponse = user.getAuthResponse();
    const accessToken = authResponse.access_token;

    if (!accessToken) {
      throw new Error("Not authenticated with Google");
    }

    // Create file metadata
    const metadata = {
      name: filename,
      mimeType: mimeType,
    };

    // Upload file
    const form = new FormData();
    form.append(
      "metadata",
      new Blob([JSON.stringify(metadata)], { type: "application/json" })
    );
    form.append("file", file);

    const response = await fetch(
      "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
        body: form,
      }
    );

    if (!response.ok) {
      throw new Error(`Upload failed: ${response.statusText}`);
    }

    const result = await response.json();
    return result;
  } catch (error) {
    console.error("Error uploading to Google Drive:", error);
    throw error;
  }
}

/**
 * Simplified backup using download (user can manually upload to Drive)
 * For full Drive integration, OAuth setup is required
 */
export function backupToCloud(data, filename, type = "json") {
  // For now, just download the file
  // User can manually upload to their preferred cloud storage
  const blob = new Blob([data], {
    type: type === "json" ? "application/json" : "application/pdf",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}


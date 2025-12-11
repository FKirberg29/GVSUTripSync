/**
 * Theme Selection Screen Component
 * 
 * Allows users to select from available color themes for the application.
 * Themes are persisted to localStorage and applied globally via CSS custom properties.
 */

import { useSettings } from "../contexts/SettingsContext";
import "./Theme.css";

/**
 * Available theme definitions with color palettes
 */
const THEMES = [
  {
    id: "light",
    name: "Light",
    description: "Clean and bright",
    colors: {
      primary: "#0077ff",
      primaryDark: "#005fcc",
      background: "#f4f6f9",
      text: "#222",
      cardBg: "#fff",
    },
  },
  {
    id: "dark",
    name: "Dark",
    description: "Easy on the eyes",
    colors: {
      primary: "#4a9eff",
      primaryDark: "#2a7fcc",
      background: "#1a1a1a",
      text: "#e0e0e0",
      cardBg: "#2d2d2d",
    },
  },
  {
    id: "ocean",
    name: "Ocean",
    description: "Calming blue tones",
    colors: {
      primary: "#2A9D8F",
      primaryDark: "#1f7f74",
      background: "#e8f4f3",
      text: "#1a3a36",
      cardBg: "#ffffff",
    },
  },
  {
    id: "sunset",
    name: "Sunset",
    description: "Warm orange and pink",
    colors: {
      primary: "#e76f51",
      primaryDark: "#c95e43",
      background: "#fff5f2",
      text: "#2d1f1c",
      cardBg: "#ffffff",
    },
  },
  {
    id: "forest",
    name: "Forest",
    description: "Natural green shades",
    colors: {
      primary: "#2d5016",
      primaryDark: "#1f350f",
      background: "#f0f5ed",
      text: "#1a2e0f",
      cardBg: "#ffffff",
    },
  },
];

/**
 * Theme selection screen component
 * 
 * @returns {JSX.Element} Theme selection page with visual theme previews
 */
export default function Theme() {
  const { theme, setTheme } = useSettings();

  /**
   * Handles theme selection and updates global theme setting
   * Theme change is persisted to localStorage and applied immediately
   * @param {string} themeId - ID of selected theme
   */
  const handleThemeSelect = (themeId) => {
    setTheme(themeId);
  };

  return (
    <div className="theme-page">
      <h1>Theme</h1>
      <p className="theme-description">Choose a color theme for your app</p>

      <div className="theme-grid">
        {THEMES.map((t) => (
          <button
            key={t.id}
            className={`theme-card ${theme === t.id ? "active" : ""}`}
            onClick={() => handleThemeSelect(t.id)}
            style={{
              "--theme-primary": t.colors.primary,
              "--theme-primary-dark": t.colors.primaryDark,
              "--theme-background": t.colors.background,
              "--theme-text": t.colors.text,
              "--theme-card-bg": t.colors.cardBg,
            }}
          >
            <div className="theme-info">
              <h3>{t.name}</h3>
              <p>{t.description}</p>
            </div>
            {theme === t.id && <div className="theme-check">✓</div>}
          </button>
        ))}
      </div>
    </div>
  );
}


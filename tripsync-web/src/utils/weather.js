/**
 * Weather and Date Utility Functions
 * 
 * Provides utilities for date manipulation, Google Weather API response parsing,
 * forecast data enrichment with current and hourly weather, and precipitation
 * unit conversion. Handles various date formats and weather data structures
 * from Google's Weather API.
 */

/**
 * Converts various date formats to JavaScript Date object
 * Handles Firestore timestamps, ISO strings, Unix timestamps, and plain dates
 * @param {any} x - Date value (timestamp, Firestore timestamp, ISO string, Date)
 * @returns {Date|null} Date object or null if conversion fails
 */
export function toDate(x) {
  if (!x) return null;
  if (x?.toDate) return x.toDate();
  const d = new Date(x);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function ymd(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

export function numOrNull(v) {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

export function asDate(raw) {
  if (!raw) return null;
  if (typeof raw === "number") {
    const ms = raw < 2e10 ? raw * 1000 : raw;
    const d = new Date(ms);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  if (typeof raw === "string") {
    const d = new Date(raw);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  if (raw.seconds != null) {
    const ms = Number(raw.seconds) * 1000 + (Number(raw.nanos) || 0) / 1e6;
    const d = new Date(ms);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  if (raw.isoString) return asDate(raw.isoString);
  return null;
}

export function coalesceText(...candidates) {
  for (const v of candidates) {
    if (v == null) continue;
    if (typeof v === "string") return v;
    if (typeof v === "object") {
      if (typeof v.text === "string") return v.text;
      if (typeof v.description === "string") return v.description;
      if (typeof v.category === "string") return v.category;
      if (v.description?.text) return v.description.text;
      if (v.summary?.text) return v.summary.text;
      if (v.name && typeof v.name === "string") return v.name;
      if (v.type && typeof v.type === "string") return v.type;
    }
  }
  return null;
}

export function deg(node) {
  if (node == null) return null;
  if (typeof node === "number") return node;
  if (typeof node.degrees === "number") return node.degrees;
  if (typeof node.fahrenheit === "number") return node.fahrenheit;
  if (typeof node.celsius === "number") return node.celsius;
  return null;
}

export function googleDailySummary(forecastDays, targetYmd) {
  if (!Array.isArray(forecastDays)) return null;
  const [y, m, d] = targetYmd.split("-").map(Number);

  const dayObj = forecastDays.find((fd) => {
    if (typeof fd?.date === "string" && fd.date === targetYmd) return true;
    const di = fd?.displayDate;
    return di && di.year === y && di.month === m && di.day === d;
  });
  if (!dayObj) return null;

  const min = Math.round(
    deg(dayObj?.minTemperature) ?? deg(dayObj?.temperatureMin) ?? NaN
  );
  const max = Math.round(
    deg(dayObj?.maxTemperature) ?? deg(dayObj?.temperatureMax) ?? NaN
  );

  const iconBase =
    dayObj?.daytimeForecast?.weatherCondition?.iconBaseUri ??
    dayObj?.nighttimeForecast?.weatherCondition?.iconBaseUri ??
    dayObj?.weatherConditions?.[0]?.iconBaseUri ??
    null;

  const iconUri = iconBase ? `${iconBase}.svg` : null;

  if (!Number.isFinite(min) || !Number.isFinite(max)) return null;
  return { min, max, iconUri, raw: dayObj };
}

export function parseDailyDetails(raw) {
  const condition =
    coalesceText(
      raw?.daytimeForecast?.weatherCondition,
      raw?.nighttimeForecast?.weatherCondition,
      raw?.weatherConditions?.[0],
      raw?.summary
    ) || "Weather details";

  const condLower = (condition || "").toLowerCase();
  const typeFromText =
    condLower.includes("snow") ? "Snow" :
    condLower.includes("sleet") ? "Sleet" :
    condLower.includes("hail") ? "Hail" :
    (condLower.includes("shower") || condLower.includes("rain") || condLower.includes("drizzle")) ? "Rain" :
    null;

  const rhDay = numOrNull(raw?.daytimeForecast?.relativeHumidity);
  const rhNight = numOrNull(raw?.nighttimeForecast?.relativeHumidity);
  const rhAvg =
    rhDay != null && rhNight != null
      ? Math.round((rhDay + rhNight) / 2)
      : rhDay != null
      ? rhDay
      : rhNight != null
      ? rhNight
      : null;

  const uvFromDaily =
    numOrNull(raw?.daytimeForecast?.uvIndex) ??
    numOrNull(raw?.nighttimeForecast?.uvIndex) ??
    numOrNull(raw?.uvIndex) ??
    numOrNull(raw?.maxUvIndex) ??
    null;

  const sunrise =
    asDate(raw?.sunEvents?.sunriseTime) ||
    asDate(raw?.sunEvents?.sunriseTimeLocal) ||
    asDate(raw?.sunriseTime) ||
    asDate(raw?.sunriseTimeLocal) ||
    asDate(raw?.astronomy?.sunriseTime) ||
    asDate(raw?.astronomy?.sunriseTimeLocal) ||
    null;

  const sunset =
    asDate(raw?.sunEvents?.sunsetTime) ||
    asDate(raw?.sunEvents?.sunsetTimeLocal) ||
    asDate(raw?.sunsetTime) ||
    asDate(raw?.sunsetTimeLocal) ||
    asDate(raw?.astronomy?.sunsetTime) ||
    asDate(raw?.astronomy?.sunsetTimeLocal) ||
    null;

  let precipChance =
    numOrNull(raw?.daytimeForecast?.precipitationChance) ??
    numOrNull(raw?.nighttimeForecast?.precipitationChance) ??
    numOrNull(raw?.precipitationChance) ??
    null;

  const dayProb = numOrNull(raw?.daytimeForecast?.precipitation?.probability?.percent);
  const nightProb = numOrNull(raw?.nighttimeForecast?.precipitation?.probability?.percent);
  if (dayProb != null) precipChance = Math.max(precipChance ?? 0, dayProb);
  if (nightProb != null) precipChance = Math.max(precipChance ?? 0, nightProb);

  const precipType =
    coalesceText(
      raw?.precipitationType,
      raw?.daytimeForecast?.precipitationType,
      raw?.nighttimeForecast?.precipitationType,
      raw?.weatherConditions?.[0]?.precipitationType
    ) || typeFromText;

  const dayQpfQty = numOrNull(raw?.daytimeForecast?.precipitation?.qpf?.quantity);
  const dayQpfUnit = (raw?.daytimeForecast?.precipitation?.qpf?.unit || "").toUpperCase();
  const nightQpfQty = numOrNull(raw?.nighttimeForecast?.precipitation?.qpf?.quantity);
  const nightQpfUnit = (raw?.nighttimeForecast?.precipitation?.qpf?.unit || "").toUpperCase();

  let accumPrecipMm =
    (numOrNull(raw?.precipitationAmount?.millimeters) ||
      numOrNull(raw?.totalPrecipitation?.millimeters) ||
      numOrNull(raw?.precipitationTotal?.millimeters) ||
      null);

  let accumPrecipIn =
    (numOrNull(raw?.precipitationAmount?.inches) ||
      numOrNull(raw?.totalPrecipitation?.inches) ||
      numOrNull(raw?.precipitationTotal?.inches) ||
      null);

  const addQpf = (qty, unit) => {
    if (qty == null) return;
    if ((unit || "").includes("MILLIMETERS")) {
      accumPrecipMm = (accumPrecipMm ?? 0) + qty;
    } else {
      accumPrecipIn = (accumPrecipIn ?? 0) + qty;
    }
  };
  addQpf(dayQpfQty, dayQpfUnit);
  addQpf(nightQpfQty, nightQpfUnit);

  return {
    conditionText: condition,
    humidity: rhAvg,
    sunrise,
    sunset,
    uvIndex: uvFromDaily,
    visibility: null,
    visibilityUnit: null,
    precipType,
    precipChance,
    precipMm: accumPrecipMm,
    precipIn: accumPrecipIn,
  };
}

export function enrichWithCurrent(base, cc) {
  if (!cc) return base;
  const out = { ...base };

  if (numOrNull(cc.relativeHumidity) != null) out.humidity = numOrNull(cc.relativeHumidity);
  if (numOrNull(cc.uvIndex) != null) out.uvIndex = numOrNull(cc.uvIndex);

  if (cc.visibility?.distance != null) {
    out.visibility = numOrNull(cc.visibility.distance);
    out.visibilityUnit =
      (cc.visibility.unit || "").toUpperCase().startsWith("KILO") ? "km" : "mi";
  }

  const prob = numOrNull(cc.precipitation?.probability?.percent);
  if (prob != null) out.precipChance = Math.max(out.precipChance ?? 0, prob);

  const qpfQty = numOrNull(cc.precipitation?.qpf?.quantity);
  const qpfUnit = (cc.precipitation?.qpf?.unit || "").toUpperCase();
  if (qpfQty != null) {
    if (qpfUnit.includes("MILLIMETERS")) {
      out.precipMm = (out.precipMm ?? 0) + qpfQty;
    } else {
      out.precipIn = (out.precipIn ?? 0) + qpfQty;
    }
  }

  const pType = coalesceText(cc.precipitation?.probability?.type);
  if (pType) out.precipType = out.precipType || pType;

  const ccCond = coalesceText(cc.weatherCondition);
  if (ccCond && (!out.conditionText || out.conditionText === "Weather details")) {
    out.conditionText = ccCond;
  }

  return out;
}

export function enrichWithHourly(base, hourly, units) {
  if (!Array.isArray(hourly?.hours) || hourly.hours.length === 0) return base;
  const out = { ...base };

  let sumQpfMm = 0;
  let sumQpfIn = 0;
  let anyQpf = false;
  let maxProb = out.precipChance ?? 0;
  let humidSum = 0;
  let humidCnt = 0;
  let uvMax = out.uvIndex ?? 0;

  for (const h of hourly.hours) {
    const prob = numOrNull(h?.precipitation?.probability?.percent);
    if (prob != null) maxProb = Math.max(maxProb, prob);

    const q = numOrNull(h?.precipitation?.qpf?.quantity);
    const unit = (h?.precipitation?.qpf?.unit || "").toUpperCase();
    if (q != null) {
      anyQpf = true;
      if (unit.includes("MILLIMETERS")) sumQpfMm += q;
      else sumQpfIn += q;
    }

    const rh = numOrNull(h?.relativeHumidity);
    if (rh != null) {
      humidSum += rh;
      humidCnt += 1;
    }

    const uv = numOrNull(h?.uvIndex);
    if (uv != null) uvMax = Math.max(uvMax, uv);
  }

  out.precipChance = maxProb;

  if (units === "METRIC") {
    const totalMm = sumQpfMm + (sumQpfIn ? sumQpfIn * 25.4 : 0);
    if (anyQpf) out.precipMm = (out.precipMm ?? 0) + totalMm;
  } else {
    const totalIn = sumQpfIn + (sumQpfMm ? sumQpfMm / 25.4 : 0);
    if (anyQpf) out.precipIn = (out.precipIn ?? 0) + totalIn;
  }

  if (humidCnt > 0) out.humidity = Math.round(humidSum / humidCnt);
  if (uvMax != null) out.uvIndex = uvMax;

  if (!out.precipType) {
    const freq = {};
    for (const h of hourly.hours) {
      const t = coalesceText(h?.precipitation?.probability?.type);
      if (!t) continue;
      freq[t] = (freq[t] || 0) + 1;
    }
    const guess = Object.entries(freq).sort((a, b) => b[1] - a[1])[0]?.[0];
    if (guess) out.precipType = guess;
  }

  return out;
}

export function toOutputPrecip(units, mm, inch) {
  if (units === "METRIC") {
    if (mm != null) return { value: Math.round(mm * 10) / 10, unit: "mm" };
    if (inch != null) return { value: Math.round(inch * 25.4 * 10) / 10, unit: "mm" };
  } else {
    if (inch != null) return { value: Math.round(inch * 100) / 100, unit: "in" };
    if (mm != null) return { value: Math.round((mm / 25.4) * 100) / 100, unit: "in" };
  }
  return { value: null, unit: units === "METRIC" ? "mm" : "in" };
}



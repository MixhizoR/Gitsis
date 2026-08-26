#!/usr/bin/env node
const url = process.env.HEALTHCHECK_URL || `http://127.0.0.1:${process.env.PORT || 4001}/api/health`;

try {
  const res = await fetch(url);
  if (!res.ok) {
    console.error(`Healthcheck failed: status ${res.status}`);
    process.exit(1);
  }
  console.log('Healthcheck ok:', res.status);
  process.exit(0);
} catch (e) {
  console.error('Healthcheck error:', e.message);
  process.exit(1);
}

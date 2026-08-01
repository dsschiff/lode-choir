export default async function globalTeardown() {
  try {
    await fetch('http://127.0.0.1:3321/__lode_test_shutdown__', { method: 'POST' });
  } catch {
    // The server may already have closed after a failed startup or interrupted run.
  }
}

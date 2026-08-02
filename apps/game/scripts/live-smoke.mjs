import { chromium } from 'playwright';

const target = process.argv[2] ?? 'https://dsschiff.github.io/lode-choir/';
const expectedSha = process.env.LODE_CHOIR_EXPECT_SHA?.slice(0, 7);
const url = new URL(target);
url.searchParams.set('seed', 'LIVE-ORISON');
url.searchParams.set('no-sw', '1');
url.searchParams.set('release-check', Date.now().toString());

const browser = await chromium.launch({ headless: true });
const errors = [];

try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  page.on('console', (message) => { if (message.type() === 'error') errors.push(`console: ${message.text()}`); });
  page.on('pageerror', (error) => errors.push(`page: ${error.message}`));
  page.on('requestfailed', (request) => errors.push(`request: ${request.url()} (${request.failure()?.errorText ?? 'failed'})`));
  const assertNoOverflow = async (surface) => {
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    if (overflow > 0) throw new Error(`${surface} overflows the phone viewport by ${overflow}px.`);
  };

  const response = await page.goto(url.toString(), { waitUntil: 'networkidle' });
  if (!response?.ok()) throw new Error(`Public page returned ${response?.status() ?? 'no response'}.`);
  await page.getByTestId('title-screen').waitFor();
  await assertNoOverflow('Public title');
  const build = (await page.locator('.build-stamp').innerText()).trim();
  if (!build.includes('0.4')) throw new Error(`Expected build 0.4, received ${build}.`);
  if (expectedSha && !build.includes(expectedSha)) throw new Error(`Expected deployed commit ${expectedSha}, received ${build}.`);

  await page.getByTestId('new-run').click();
  await page.getByTestId('begin-descent').click();
  await page.getByTestId('prologue-screen').waitFor();
  await assertNoOverflow('Public prologue');
  const premise = (await page.getByTestId('prologue-screen').innerText()).trim();
  for (const required of ['walking mining citadel', 'Provisions pay for missions', 'Mara Vey', 'Sable-9']) {
    if (!premise.includes(required)) throw new Error(`Public prologue is missing: ${required}`);
  }
  await page.getByTestId('enter-orison').click();
  await assertNoOverflow('Public planner');
  await page.getByTestId('route-0').click();
  await page.getByTestId('staff-0-mara').click();
  await page.getByTestId('staff-1-tamsin').click();
  await page.getByTestId('staff-2-orin').click();
  await page.getByTestId('resolve-shift').click();
  await page.getByTestId('event-panel').waitFor();
  await assertNoOverflow('Public event');
  const eventTitle = (await page.getByTestId('event-panel').getByRole('heading').innerText()).trim();
  await page.locator('[data-testid^="event-choice-"]:not([disabled])').first().click();
  await page.getByRole('heading', { name: 'Prepare this shift' }).waitFor();
  await page.locator('.header-actions').getByRole('button', { name: 'Open expedition log and menu' }).click();
  await assertNoOverflow('Public journal');
  const journal = (await page.getByTestId('expedition-journal').innerText()).trim();
  if (!journal.includes(eventTitle)) throw new Error(`Public journal did not retain ${eventTitle}.`);
  if (errors.length > 0) throw new Error(errors.join('\n'));

  console.log(JSON.stringify({ target: url.origin + url.pathname, build, expectedSha: expectedSha ?? null, eventTitle, viewport: '390x844', errors: 0 }));
} finally {
  await browser.close();
}

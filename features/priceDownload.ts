import puppeteer from 'puppeteer';

export async function scrapeWithPuppeteer() {
  // Launch a browser
  const browser = await puppeteer.launch();
  const page = await browser.newPage();

  // Log in using the form fields on the page
  await page.goto('https://b2b.pin-avto.ru/?page=11');
  await page.type('input[name="login"]', 'info@prodavec-zapchastei.ru');
  await page.type('input[name="password"]', '12345');
  await page.click('input[type="submit"]');

  // Wait for navigation after login
  await page.waitForNavigation();

  // Go to the page containing the links
  await page.goto('https://b2b.pin-avto.ru/?page=60');

  // Get all the download links
  const links = await page.$$eval('a', (anchors) => {
    return anchors
      .filter(anchor => anchor.href.includes('.xml'))
      .map(anchor => anchor.href);
  });

  console.log('Found download links:', links);

  // Close the browser
  await browser.close();
}


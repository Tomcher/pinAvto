var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
import puppeteer from 'puppeteer';
export function scrapeWithPuppeteer() {
    return __awaiter(this, void 0, void 0, function* () {
        // Launch a browser
        const browser = yield puppeteer.launch();
        const page = yield browser.newPage();
        // Log in using the form fields on the page
        yield page.goto('https://b2b.pin-avto.ru/?page=11');
        yield page.type('input[name="login"]', 'info@prodavec-zapchastei.ru');
        yield page.type('input[name="password"]', '12345');
        yield page.click('input[type="submit"]');
        // Wait for navigation after login
        yield page.waitForNavigation();
        // Go to the page containing the links
        yield page.goto('https://b2b.pin-avto.ru/?page=60');
        // Get all the download links
        const links = yield page.$$eval('a', (anchors) => {
            return anchors
                .filter(anchor => anchor.href.includes('.xml'))
                .map(anchor => anchor.href);
        });
        console.log('Found download links:', links);
        // Close the browser
        yield browser.close();
    });
}

import json
import os

from playwright.sync_api import sync_playwright


BASE_URL = os.environ.get("MS_REALTY_TEST_BASE_URL", "http://127.0.0.1:8787")
TOKEN = os.environ["MS_REALTY_TEST_ADMIN_TOKEN"]


def main():
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True)
        context = browser.new_context(viewport={"width": 390, "height": 844}, reduced_motion="reduce")

        def add_local_auth(route):
            request = route.request
            if request.url.startswith(BASE_URL):
                route.continue_(headers={**request.headers, "authorization": f"Bearer {TOKEN}"})
            else:
                route.continue_()

        context.route("**/*", add_local_auth)
        page = context.new_page()
        response = page.goto(
            f"{BASE_URL}/admin/listings/edit?listingId=MS-00815&locale=en",
            wait_until="networkidle",
            timeout=30_000,
        )
        if response is None or response.status != 200:
            raise AssertionError(f"listing editor returned {response.status if response else 'no response'}")
        geometry = page.evaluate(
            """
            () => {
              const visible = (element) => {
                if (!element) return false;
                const style = getComputedStyle(element);
                const box = element.getBoundingClientRect();
                return style.display !== 'none' && style.visibility !== 'hidden' && box.width > 0 && box.height > 0;
              };
              const rect = (element) => {
                const box = element.getBoundingClientRect();
                return {x: box.x, y: box.y, right: box.right, bottom: box.bottom, width: box.width, height: box.height};
              };
              const intersects = (left, right) =>
                left.x < right.right && left.right > right.x && left.y < right.bottom && left.bottom > right.y;
              const main = document.querySelector('[data-editor-shell] .adm-editor-main');
              const support = document.querySelector('[data-editor-shell] .adm-editor-support');
              const mainPanels = [...(main?.querySelectorAll(':scope > .crm-panel') || [])].filter(visible);
              const supportPanels = [...(support?.querySelectorAll(':scope > .crm-panel') || [])].filter(visible);
              const panelIntersections = [];
              for (const mainPanel of mainPanels) {
                for (const supportPanel of supportPanels) {
                  if (intersects(rect(mainPanel), rect(supportPanel))) {
                    panelIntersections.push({main: rect(mainPanel), support: rect(supportPanel)});
                  }
                }
              }
              const savebar = document.querySelector('[data-editor-savebar]');
              const form = document.querySelector('[data-editor-primary-panel] form[data-editor-form]');
              const contentSections = [...(form?.querySelectorAll(':scope > .adm-form__group, :scope > .adm-editor-section') || [])].filter(visible);
              const savebarIntersections = contentSections
                .filter((section) => intersects(rect(savebar), rect(section)))
                .map((section) => ({savebar: rect(savebar), content: rect(section)}));
              return {
                viewport: {width: window.innerWidth, height: window.innerHeight},
                shell: rect(document.querySelector('[data-editor-shell]')),
                main: rect(main),
                support: rect(support),
                supportPosition: getComputedStyle(support).position,
                savebar: rect(savebar),
                savebarPosition: getComputedStyle(savebar).position,
                panelIntersections,
                savebarIntersections,
              };
            }
            """
        )
        assert geometry["supportPosition"] == "static", geometry
        assert geometry["savebarPosition"] == "static", geometry
        assert not geometry["panelIntersections"], geometry
        assert not geometry["savebarIntersections"], geometry
        print(json.dumps({"kind": "admin_mobile_geometry", "status": "passed", "geometry": geometry}))
        context.close()
        browser.close()


if __name__ == "__main__":
    main()

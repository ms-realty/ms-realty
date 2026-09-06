import json
import os
import tempfile
from pathlib import Path

from playwright.sync_api import sync_playwright

BASE_URL = os.environ.get("MS_REALTY_TEST_BASE_URL", "http://127.0.0.1:8787").rstrip("/")
TOKEN = os.environ["MS_REALTY_TEST_ADMIN_TOKEN"]


def main():
    output = Path(os.environ.get("MS_REALTY_TEST_OUTPUT") or tempfile.mkdtemp(prefix="msr-today-browser-"))
    output.mkdir(parents=True, exist_ok=True)
    results = []
    variants = [(1440, "light", True), (1440, "dark", True), (390, "light", True),
                (390, "dark", True), (1440, "light", False)]
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(channel="chrome", headless=True)
        for width, theme, javascript in variants:
            context = browser.new_context(
                viewport={"width": width, "height": 1000 if width == 1440 else 844},
                color_scheme=theme,
                java_script_enabled=javascript,
            )
            context.route(BASE_URL + "/**", lambda route: route.continue_(
                headers={**route.request.headers, "authorization": "Bearer " + TOKEN}))
            page = context.new_page()
            response = page.goto(BASE_URL + "/admin/today?locale=en", wait_until="networkidle")
            assert response.status == 200
            links = page.locator("[data-today-select]")
            count = links.count()
            assert count > 1, "Run against the local queue fixtures."
            assert page.locator("[data-today-detail]:visible").count() == 1
            target = links.nth(1).get_attribute("data-today-select")
            links.nth(1).click()
            assert page.locator("[data-today-detail]:visible").get_attribute("id") == target
            if javascript:
                search = page.get_by_role("searchbox", name="Search this queue")
                search.fill("no-match-unique-test-string")
                assert page.locator("[data-today-detail]:visible").count() == 0
                assert page.locator("[data-next-action]:visible").count() == 0
                assert page.get_by_text("No matching tasks.", exact=True).is_visible()
                search.fill("")
                page.locator('[data-today-filter="lead"]').click()
                assert page.locator("[data-next-action]:visible").count() > 0
                assert page.locator('[data-next-action]:visible:not([data-next-action="lead"])').count() == 0
                assert page.locator("[data-today-detail]:visible").count() == 1
                page.locator('[data-today-filter="all"]').click()
            else:
                assert not page.locator(".adm-today-queue__tools").is_visible()
            ids = page.locator("[id]").evaluate_all("elements => elements.map(element => element.id)")
            assert len(ids) == len(set(ids)), "Duplicate IDs break queue selection and prompt labels."
            geometry = page.evaluate("""() => ({
                overflow: document.documentElement.scrollWidth > innerWidth,
                queue: document.querySelector('.adm-today-queue').getBoundingClientRect().toJSON(),
                detail: document.querySelector('.adm-today-details').getBoundingClientRect().toJSON()
            })""")
            assert not geometry["overflow"], geometry
            page.screenshot(path=str(output / f"today-{width}-{theme}-{javascript}.png"))
            results.append({"width": width, "theme": theme, "javascript": javascript,
                            "tasks": count, "status": "passed", "geometry": geometry})
            context.close()
        browser.close()
    (output / "today-functional.json").write_text(json.dumps(results, indent=2))
    print(json.dumps(results))


if __name__ == "__main__":
    main()

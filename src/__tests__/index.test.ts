import { parseItemUrl, run } from "../";

const originalFetch = global.fetch;
beforeEach(() => {
    global.fetch = originalFetch;
});

describe("parseItemUrl", () => {
    test("valid URLs", () => {
        expect(
            parseItemUrl(
                "https://www.arcgis.com/home/item.html?id=25c278bd96aa49949f8a89564c6347ce"
            )
        ).toEqual({
            itemId: "25c278bd96aa49949f8a89564c6347ce",
            portalUrl: "https://www.arcgis.com",
        });
        expect(
            parseItemUrl(
                "https://server/portal/home/item.html?id=25c278bd96aa49949f8a89564c6347ce"
            )
        ).toEqual({
            itemId: "25c278bd96aa49949f8a89564c6347ce",
            portalUrl: "https://server/portal",
        });
    });
    test("invalid URLs", () => {
        expect(() => parseItemUrl("")).toThrow();
        expect(() =>
            parseItemUrl("https://www.arcgis.com/home/item.html?id=")
        ).toThrow();
        expect(() =>
            parseItemUrl(
                "www.arcgis.com/home/item.html?id=25c278bd96aa49949f8a89564c6347ce"
            )
        ).toThrow();
        expect(() =>
            parseItemUrl(
                "https://www.arcgis.com/item.html?id=25c278bd96aa49949f8a89564c6347ce"
            )
        ).toThrow();
    });
});

describe("run", () => {
    test("basic", async () => {
        const MOCK_PORTAL_ITEM_ID = "mock-portal-item-id";
        const MOCK_PORTAL_TOKEN = "mock-portal-token";

        const MOCK_REPORTING_TOKEN = "mock-reporting-token";
        const MOCK_REPORT_TICKET = "mock-report-ticket";
        const MOCK_REPORT_TAG = "mock-report-tag";

        const DEFAULT_REPORTING_URL =
            "https://apps.vertigisstudio.com/reporting";
        const DEFAULT_PORTAL_URL = "https://www.arcgis.com";

        // https://www.arcgis.com/sharing/content/items/25c278bd96aa49949f8a89564c6347ce?f=json&token=
        const MOCK_PORTAL_ITEM_RESPONSE = {
            access: "public",
            typeKeywords: ["Geocortex Reporting"],
            url: `${DEFAULT_REPORTING_URL}/`,
        };

        // https://apps.vertigisstudio.com/reporting/service/auth/token/run
        const MOCK_REPORTING_TOKEN_RESPONSE = {
            response: {
                token: MOCK_REPORTING_TOKEN,
            },
        };

        // https://apps.vertigisstudio.com/reporting/service/job/run
        const MOCK_REPORTING_JOB_RUN_RESPONSE = {
            response: {
                $type: "TokenResponse",
                ticket: MOCK_REPORT_TICKET,
            },
        };

        // https://apps.vertigisstudio.com/reporting/service/job/artifacts?ticket=
        const MOCK_REPORTING_JOB_ARTIFACTS_RESPONSE_PENDING = {
            results: [],
        };
        const MOCK_REPORTING_JOB_ARTIFACTS_RESPONSE_DONE = {
            results: [
                {
                    $type: "JobResult",
                    contentType: "application/pdf",
                    length: 24003,
                    tag: MOCK_REPORT_TAG,
                },
            ],
        };

        const mockFetch = jest.fn();
        global.fetch = mockFetch;
        jest.spyOn(global, "fetch");

        function mockResponseOnce(
            response: Record<string, unknown>,
            callback?: (input: RequestInfo, init: RequestInit) => void
        ) {
            mockFetch.mockImplementationOnce((input, init) => {
                callback?.(input, init);
                return Promise.resolve({
                    ok: true,
                    json: () => Promise.resolve(response),
                    status: 200,
                    statusText: "OK",
                });
            });
        }

        mockResponseOnce(MOCK_PORTAL_ITEM_RESPONSE);
        mockResponseOnce(MOCK_REPORTING_TOKEN_RESPONSE);
        mockResponseOnce(MOCK_REPORTING_JOB_RUN_RESPONSE, (input, init) =>
            expect(init.headers?.["Authorization"]).toBe(
                `Bearer ${MOCK_REPORTING_TOKEN}`
            )
        );
        mockResponseOnce(MOCK_REPORTING_JOB_ARTIFACTS_RESPONSE_PENDING);
        mockResponseOnce(MOCK_REPORTING_JOB_ARTIFACTS_RESPONSE_DONE);

        expect(
            await run(MOCK_PORTAL_ITEM_ID, {
                portalUrl: DEFAULT_PORTAL_URL,
                parameters: {
                    parameter1: "asdf",
                    parameter2: [1, 2, 3],
                },
                resultFileName: "My Report",
                token: MOCK_PORTAL_TOKEN,
                usePolling: true,
                format: "pdf",
            })
        ).toBe(
            `${DEFAULT_REPORTING_URL}/service/job/result?ticket=${MOCK_REPORT_TICKET}&tag=${MOCK_REPORT_TAG}`
        );
        expect(global.fetch).toHaveBeenNthCalledWith(
            3,
            "https://apps.vertigisstudio.com/reporting/service/job/run",
            expect.objectContaining({
                body: '{"template":{"itemId":"mock-portal-item-id","portalUrl":"https://www.arcgis.com","title":"My Report"},"parameters":[{"name":"parameter1","value":"asdf"},{"containsMultipleValues":true,"name":"parameter2","values":[1,2,3]}],"format":"pdf"}',
                headers: {
                    Authorization: "Bearer mock-reporting-token",
                    "Content-Type": "application/json",
                },
                method: "POST",
                responseType: "json",
            })
        );
    });
    test("itemId option is required", async () => {
        await expect(run(undefined!)).rejects.toThrow("itemId is required.");
    });
});

// test("live", async () => {
//     global.fetch = nodeFetch;
//     const href = await run({
//         itemId: "25c278bd96aa49949f8a89564c6347ce",
//         parameters: {
//             parameter1: "asdf",
//             parameter2: [1, 2, 3]
//         },
//         token: "<your token>",
//         usePolling: true
//     });
//     console.log(href)
//     expect(href).toMatch("https://apps.vertigisstudio.com/reporting/service/job/result?ticket");
// }, 100000);

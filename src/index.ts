type SingleParameterValue = string | number | boolean;
type MultiParameterValue = string[] | number[] | boolean[];

interface Parameter {
    name: string;
    containsMultipleValues?: boolean;
    value?: SingleParameterValue;
    values?: MultiParameterValue;
}

interface PortalItemResponse {
    typeKeywords?: string[];
    url?: string;
}

interface JobStatusResponse {
    results?: {
        $type: "JobResult" | "JobQuit"
        code?: number,
        message?: string,
        tag?: string,
    }[],
    error?: {
        message: string,
        status: number,
    },
}

/**
 * Parses a portal item URL string and returns the portal URL and item ID components.
 * @param url The URL of the portal item.
 * @returns An object containing the portal URL and the item ID.
 */
export function parseItemUrl(url: string): { itemId: string, portalUrl: string } {
    const portalItemRegex = /^(https?:\/\/.*?)\/home\/item.html.*?id=([a-f0-9]+)/i;
    const urlParts = url.match(portalItemRegex);
    
    if (urlParts && urlParts.length > 2) {
        return {
            itemId: urlParts[2],
            portalUrl: urlParts[1],
        };
    }

    throw new Error("The item URL is invalid.");
}

/**
 * Runs a report.
 * @param itemId The portal item ID of the Reporting or Printing item.
 * @param portalUrl The URL of the ArcGIS Portal instance to use. Defaults to ArcGIS Online: "https://www.arcgis.com".
 * @param parameters The parameters to submit to the report.
 * @param token An optional token for accessing a secured reports.
 * @param culture The culture to use for localization. For example "en-US".
 * @param dpi The DPI to use when rendering a map print.
 * @param usePolling Whether to check the status of the job using polling.
 * @returns A URL to the report output file.
 */
export async function run(
    itemId: string,
    portalUrl = "https://www.arcgis.com",
    parameters: Record<string, SingleParameterValue | MultiParameterValue> = {},
    token?: string,
    culture?: string,
    dpi?: number,
    usePolling = false,
): Promise<string> {
    const portalItemInfo = await getPortalItemInfo(itemId, portalUrl, token);
    validatePortalItemInfo(portalItemInfo);

    const apiServiceUrl = `${portalItemInfo.url}service`;
    const bearerToken = await getBearerToken(apiServiceUrl, portalUrl, token);
    const ticket = await startJob(portalUrl, itemId, apiServiceUrl, bearerToken, parameters, culture, dpi);
    const tag = await watchJob(itemId, apiServiceUrl, ticket, usePolling);
    const downloadUrl = `${apiServiceUrl}/job/result?ticket=${ticket}&tag=${tag}`;

    return downloadUrl;
}

// Gets the portal item info JSON
async function getPortalItemInfo(
    itemId: string,
    portalUrl: string,
    token?: string
): Promise<PortalItemResponse> {
    const url = `${portalUrl}/sharing/content/items/${itemId}?f=json&token=${token || ""}`;
    let response: Response;

    try {
        response = await fetch(url);
    } catch (error) {
        throw new Error("A network error occurred fetching the item.");
    }

    // Check if an error response was received during the fetch
    if (!response.ok) {
        throwError(response.statusText, response.status);
    }

    const portalInfo = await response.json();

    // Esri wraps errors in a 200 response, so an additional error check is required.
    if (portalInfo.error) {
        throwError(portalInfo.error.message, portalInfo.error.code);
    }

    return portalInfo;
}

// Ensures that a portal item's info contain the "Geocortex Printing" or "Geocortex Reporting" keyword
// and that the URL property has a value.
function validatePortalItemInfo(info: PortalItemResponse): void {
    if (!info.typeKeywords || !Array.from(info.typeKeywords).some(x => x === "Geocortex Printing" || x === "Geocortex Reporting")) {
        throw new Error("The configured URL does not reference a valid template.");
    }

    if (!info.url) {
        throw new Error("The template does not contain a service URL.");
    }
}

// Gets a bearer token from the service.
async function getBearerToken(
    serviceUrl: string,
    portalUrl: string,
    token: string | undefined
): Promise<string> {
    if (!token) {
        return "";
    }

    const body = {
        accessToken: token,
        portalUrl,
    };

    const options = {
        method: "POST",
        responseType: "json",
        body: JSON.stringify(body),
        headers: { "Content-Type": "application/json" },
    };
    let response: Response;

    try {
        response = await fetch(`${serviceUrl}/auth/token/run`, options);
    } catch {
        throw new Error("A network error occurred fetching an authorization token.");
    }

    if (!response.ok) {
        throwError(response.statusText, response.status);
    }

    const responseJson = await response.json();
    const bearerToken = responseJson.response && responseJson.response.token ? responseJson.response.token : "";

    return `Bearer ${bearerToken}`;
}

async function startJob(
    portalUrl: string,
    itemId: string,
    apiServiceUrl: string,
    bearerToken: string,
    parameters: Record<string, SingleParameterValue | MultiParameterValue>,
    culture?: string,
    dpi?: number
): Promise<string> {
    const params: Parameter[] = [];
    for (const name in parameters) {
        const value = parameters[name];
        if (Array.isArray(value)) {
            params.push({
                containsMultipleValues: true,
                name,
                values: value,
            });
        } else {
            params.push({
                name,
                value,
            });
        }
    }
    const body = {
        template: {
            itemId: itemId,
            portalUrl,
        },
        parameters: params,
        culture,
        dpi,
    };
    const requestOptions = {
        method: "POST",
        responseType: "json",
        body: JSON.stringify(body),
        headers: {
            "Content-Type": "application/json",
            Authorization: bearerToken,
        },
    };
    let response: Response;

    try {
        response = await fetch(`${apiServiceUrl}/job/run`, requestOptions);
    } catch {
        throw new Error("A network error occurred attempting to run a job.");
    }

    if (!response.ok) {
        throwError(response.statusText, response.status);
    }

    const responseJson = await response.json();
    const data = responseJson.response;

    if (!data || !data.ticket) {
        throwError("The service did not provide a ticket.");
    }

    return data.ticket;
}

async function watchJob(
    itemId: string,
    apiServiceUrl: string,
    ticket: string,
    usePolling = false
): Promise<string> {
    let tag;

    if (!usePolling && "WebSocket" in window || "MozWebSocket" in window) {
        tag = await watchJobWithSocket(apiServiceUrl, ticket);
    }

    if (!tag) {
        tag = await pollJob(apiServiceUrl, ticket);
    }

    if (!tag) {
        throwError("The service did not provide a tag.");
    }

    return tag;
}

async function watchJobWithSocket(
    apiServiceUrl: string,
    ticket: string
): Promise<string> {
    apiServiceUrl = apiServiceUrl.replace(/^http/, "ws");

    return new Promise<string>((resolve) => {
        const socket = new WebSocket(`${apiServiceUrl}/job/artifacts?ticket=${ticket}`);

        socket.onmessage = async (message): Promise<void> => {
            const messageJson =
                typeof message.data === "string" ? JSON.parse(message.data) : message.data;

            // The server will send a message with 'final=true' to indicate it is
            // closing the connection. Let's close the socket on our end and resolve
            // the promise.
            if (messageJson.final) {
                socket.close();
                resolve(undefined);
            }

            const tag = checkJobStatusResponse(messageJson);

            if (tag) {
                socket.close();
                resolve(tag);
            }

            // If no tag is received, resolve and allow fall back to polling.
            resolve();
        };

        socket.onerror = (): void => {
            // No need to handle the error, we will fall back to polling.
            socket.close();
            resolve();
        };
    });
}

async function pollJob(
    apiServiceUrl: string,
    ticket: string
): Promise<string> {

    const options = {
        method: "GET",
        responseType: "json",
        headers: { "Content-Type": "application/json" },
    };

    let tag;

    while (!tag) {
        await delay(1000);
        let response: Response;

        try {
            response = await fetch(`${apiServiceUrl}/job/artifacts?ticket=${ticket}`, options);
        } catch {
            throw new Error("A network error occurred checking the job status.");
        }

        if (!response.ok) {
            throwError(response.statusText, response.status);
        }

        const responseJson = await response.json();
        tag = checkJobStatusResponse(responseJson);
    }

    return tag;
}

function checkJobStatusResponse(response: JobStatusResponse): string | undefined {
    const results = response.results;
    const error = response.error;
    const genericErrorMessage = "The request could not be completed.";

    if (error) {
        throwError(error.message, error.status);
    } else if (results) {
        const result = results.find((result) => result["$type"] === "JobResult");

        if (result) {
            return result.tag;
        }

        const quit = results.find((result) => result["$type"] === "JobQuit");

        if (quit) {
            const error = results.find(
                (result) => result["$type"] && result["$type"].endsWith("error")
            );
            const message = error?.message || genericErrorMessage;
            throwError(message, error?.code);
        }
    } else {
        throwError(genericErrorMessage);
    }

    return undefined;
}

function throwError(statusText: string, status?: number): void {
    const message = status
        ? `Error code: ${status}. Response error: "${statusText}"`
        : `Response error: "${statusText}"`;
    throw new Error(message);
}

function delay(ms = 0): Promise<void> {
    return new Promise<void>(resolve => {
        setTimeout(resolve, ms);
    });
}

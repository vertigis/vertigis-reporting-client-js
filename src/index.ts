type SingleParameterValue = string | number | boolean;
type MultiParameterValue = string[] | number[] | boolean[];

interface MapValue {
    $type: string;
    item: {
        type: string;
        extent: [[number, number], [number, number]];
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    itemData: any;
}

interface MapParameter extends MapValue {
    name: string;
}

interface Parameter {
    name: string;
    containsMultipleValues?: boolean;
    value?: SingleParameterValue;
    values?: MultiParameterValue;
}

interface PortalItemResponse {
    typeKeywords?: string[];
    url?: string;
    error?: {
        message: string;
        code?: number;
    };
}

interface TokenResponse {
    response?: {
        token?: string;
    };
}

interface JobRunResponse {
    response?: {
        ticket: string;
    };
}

interface JobStatusResponse {
    results?: {
        $type: "JobResult" | "JobQuit";
        code?: number;
        message?: string;
        tag?: string;
    }[];
    error?: {
        message: string;
        status: number;
    };
}

interface WsJobStatusResponse extends JobStatusResponse {
    final?: boolean;
}

/**
 * Represents control metadata that may be of interest to a client.
 */
interface ControlProperties {
    /**
     * The type of control this metadata describes.
     */
    controlType: string;

    /**
     * The context of information about a control (eg MainMap.Height). Used by a
     * client application to infer the use/purpose of the parameter.
     */
    purpose: string;

    /**
     * The height of the control in millimeters.
     */
    height: number;

    /**
     * The width of the control in millimeters.
     */
    width: number;
}

/**
 * The parameters associated with a print template.
 */
export interface PrintMetadata {
    /**
     * The PrintParameters associated with a print template.
     */
    parameters: any;

    /**
     * Metadata about the controls of a print template.
     */
    controls: ControlProperties[];
}

/**
 * Parses a portal item URL string and returns the portal URL and item ID components.
 * @param url The URL of the portal item.
 * @returns An object containing the portal URL and the item ID.
 */
export function parseItemUrl(url: string): {
    itemId: string;
    portalUrl: string;
} {
    const portalItemRegex =
        /^(https?:\/\/.*?)\/home\/item.html.*?id=([a-f0-9]+)/i;
    const urlParts = portalItemRegex.exec(url);

    if (urlParts && urlParts.length > 2) {
        return {
            itemId: urlParts[2],
            portalUrl: urlParts[1],
        };
    }

    throw new Error("The item URL is invalid.");
}

/**
 * Options for running a report.
 */
export interface RunOptions {
    /**
     * The culture to use for localization. For example "en-US". This option is
     * supported from VertiGIS Studio Reporting 5.9 and VertiGIS Studio Printing
     * 5.6.
     */
    culture?: string;
    /**
     * The DPI to use when rendering a map print.
     */
    dpi?: number;
    /**
     * The output file format of the report. The default is "pdf".
     */
    format?: string;
    /**
     * An object specifying the parameters to submit to the report.
     * The keys of the object must match the parameter names that exist in the report.
     */
    parameters?: Record<
        string,
        SingleParameterValue | MultiParameterValue | MapValue
    >;
    /**
     * The URL of the ArcGIS Portal instance to use. Defaults to ArcGIS Online: "https://www.arcgis.com".
     */
    portalUrl?: string;
    /**
     * The name assigned to the output file. It is used as the name of the tab when viewing the
     * result in a browser and as the suggested name when downloading the result.
     */
    resultFileName?: string;
    /**
     * An optional ArcGIS token for accessing a secured report.
     * If the report is secured, or accesses secured ArcGIS content the token is required.
     */
    token?: string;
    /**
     * Whether to check the status of the job using polling.
     * If true, the service will be polled periodically for results.
     * If false, connect to the service using WebSockets to listen for results.
     * It is recommended to use WebSockets where possible.
     * The default is false.
     */
    usePolling?: boolean;
}

export const MM_PER_INCH = 25.4;

/**
 * Runs a VertiGIS Studio report or print.
 * @param itemId The portal item ID of the report item.
 * @param options The options that define the report to run and how to run it.
 * @returns A URL to the report output file.
 */
export async function run(
    itemId: string,
    options: RunOptions = {}
): Promise<string> {
    if (!itemId) {
        throw new Error("itemId is required.");
    }

    // Ensure the portal URL doesn't end with a trailing slash
    const portalUrl =
        options.portalUrl?.replace(/\/$/, "") || "https://www.arcgis.com";

    // Fetch the portal item
    const portalItemInfo = await getPortalItemInfo(
        itemId,
        portalUrl,
        options.token
    );

    // Ensure it is a valid item
    if (!isValidItemType(portalItemInfo)) {
        throw new Error(`The item '${itemId}' is not a valid template type.`);
    }
    if (!portalItemInfo.url) {
        throw new Error(`The item '${itemId}' does not contain a service URL.`);
    }

    // Infer the URL to the reporting service from the item
    const apiServiceUrl = `${portalItemInfo.url}service`;

    // Authentication
    const bearerToken = await getBearerToken(
        apiServiceUrl,
        portalUrl,
        options.token
    );

    // Start the reporting job
    const ticket = await startJob(
        portalUrl,
        itemId,
        apiServiceUrl,
        bearerToken,
        options.parameters,
        options.culture,
        options.dpi,
        options.resultFileName,
        options.format
    );

    // Watch or poll the job
    const tag = await watchJob(apiServiceUrl, ticket, options.usePolling);

    // Assemble the URL to the completed report
    const downloadUrl = `${apiServiceUrl}/job/result?ticket=${ticket}&tag=${tag}`;
    return downloadUrl;
}

// Gets the portal item info JSON
async function getPortalItemInfo(
    itemId: string,
    portalUrl: string,
    token?: string
): Promise<PortalItemResponse> {
    const url = `${portalUrl}/sharing/content/items/${itemId}?f=json&token=${
        token || ""
    }`;
    const response = await fetch(url);

    // Check if an error response was received during the fetch
    if (!response.ok) {
        throw createError(response.statusText, response.status);
    }

    const portalInfo = (await response.json()) as PortalItemResponse;

    // Esri wraps errors in a 200 response, so an additional error check is required.
    if (portalInfo.error) {
        throw createError(portalInfo.error.message, portalInfo.error.code);
    }

    return portalInfo;
}

export async function getItemMetadata(itemId: string, portalUrl: string, token: string): Promise<PrintMetadata> {
    // Fetch the portal item
    const portalItemInfo = await getPortalItemInfo(
        itemId,
        portalUrl,
        token
    );

    // Infer the URL to the reporting service from the item
    const apiServiceUrl = `${portalItemInfo.url}service`;

    const bearerToken = await getBearerToken(apiServiceUrl, portalUrl, token)

    const body = {
        template: {
            itemId,
            portalUrl,
        }
    };
    const headers = {
        "Content-Type": "application/json",
    };
    if (token) {
        headers["Authorization"] = `Bearer ${bearerToken}`;
    }
    const requestOptions = {
        method: "POST",
        responseType: "json",
        body: JSON.stringify(body),
        headers,
    };

    try {
        // Make the metadata request
        let response: Response;
        response = await fetch(`${apiServiceUrl}/job/metadata`, requestOptions)

        if (!response.ok) {
            createError(response.statusText, response.status);
        }
    
        // Parse the response
        const responseJson =
            typeof (response as any).data === "string"
                ? JSON.parse((response as any).data)
                : await response.json();

        const data = responseJson.response;
        if (!data || !data.parameters) {
            throw new Error("The print service did not provide any metadata.");
        }
    
        // Create the metadata object
        const controlMetadata = marshalControlProperties(data.controls);
        const metadata = {
            parameters: data.parameters,
            controls: controlMetadata,
        };

        return metadata;
    } catch (error) {
        throw new Error(
            `An error occurred. Unable to get print template metadata. ${error}`
        )
    }
}

/**
 * Marshals control metadata into ControlProperties.
 *
 * @param controls The source of control metadata.
 */
function marshalControlProperties (controls: any[]): ControlProperties[] {
    const props: ControlProperties[] = [];

    if (!controls || controls.length === 0) {
        return props;
    }

    for (const control of controls) {
        const controlProps = {
            controlType: control.controlType,
            purpose: control.purpose,
            height: convertToMillimeters(control.height, control.units),
            width: convertToMillimeters(control.width, control.units),
        };

        props.push(controlProps);
    }

    return props;
}

function convertToMillimeters(value: number, units: string): number {
    if (units === "HundredsOfAnInch") {
        return (value / 100) * MM_PER_INCH;
    }

    if (units === "TenthsOfAMillimeter") {
        return value / 10;
    }

    return value;
}

// Ensures that a portal item's info contain the "Geocortex Printing" or "Geocortex Reporting" keyword
function isValidItemType(info: PortalItemResponse): boolean {
    return !(
        !info.typeKeywords ||
        !Array.from(info.typeKeywords).some(
            (x) => x === "Geocortex Printing" || x === "Geocortex Reporting"
        )
    );
}

// Gets a bearer token from the service.
export async function getBearerToken(
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
        throw new Error(
            "A network error occurred fetching an authorization token."
        );
    }

    if (!response.ok) {
        throw createError(response.statusText, response.status);
    }

    const responseJson = (await response.json()) as TokenResponse;
    const bearerToken = responseJson?.response?.token || "";

    return `Bearer ${bearerToken}`;
}

async function startJob(
    portalUrl: string,
    itemId: string,
    apiServiceUrl: string,
    bearerToken: string,
    parameters?: Record<
        string,
        SingleParameterValue | MultiParameterValue | MapValue
    >,
    culture?: string,
    dpi?: number,
    title?: string,
    format?: string
): Promise<string> {
    const params: (Parameter | MapParameter)[] = [];
    if (parameters) {
        for (const name in parameters) {
            const value = parameters[name];
            if (Array.isArray(value)) {
                params.push({
                    containsMultipleValues: true,
                    name,
                    values: value,
                });
            } else if ((value as MapValue)?.$type) {
                params.push({ ...(value as MapValue), name });
            } else {
                params.push({
                    name,
                    value: value as SingleParameterValue,
                });
            }
        }
    }

    const body = {
        template: {
            itemId: itemId,
            portalUrl,
            title,
        },
        parameters: params,
        culture,
        dpi,
        format,
    };
    const requestOptions = {
        method: "POST",
        responseType: "json",
        body: JSON.stringify(body),
        headers: {
            "Content-Type": "application/json",
        },
    };

    if (bearerToken) {
        requestOptions.headers["Authorization"] = bearerToken;
    }

    let response: Response;

    try {
        response = await fetch(`${apiServiceUrl}/job/run`, requestOptions);
    } catch {
        throw new Error("A network error occurred attempting to run a job.");
    }

    if (!response.ok) {
        throw createError(response.statusText, response.status);
    }

    const responseJson = (await response.json()) as JobRunResponse;
    const data = responseJson.response;

    if (!data || !data.ticket) {
        throw createError("The service did not provide a ticket.");
    }

    return data.ticket;
}

async function watchJob(
    apiServiceUrl: string,
    ticket: string,
    usePolling = false
): Promise<string> {
    let tag: string | undefined;

    if (!usePolling && "WebSocket" in globalThis) {
        tag = await watchJobWithSocket(apiServiceUrl, ticket);
    }

    if (!tag) {
        tag = await pollJob(apiServiceUrl, ticket);
    }

    if (!tag) {
        throw createError("The service did not provide a tag.");
    }

    return tag;
}

async function watchJobWithSocket(
    apiServiceUrl: string,
    ticket: string
): Promise<string | undefined> {
    apiServiceUrl = apiServiceUrl.replace(/^http/, "ws");

    return new Promise<string | undefined>((resolve) => {
        const socket = new WebSocket(
            `${apiServiceUrl}/job/artifacts?ticket=${ticket}`
        );

        socket.addEventListener("message", (message) => {
            const messageJson = (
                typeof message.data === "string"
                    ? JSON.parse(message.data)
                    : message.data
            ) as WsJobStatusResponse;

            // The server will send a message with 'final=true' to indicate it is
            // closing the connection. Let's close the socket on our end and resolve
            // the promise.
            if (messageJson.final) {
                socket.close();
                resolve(undefined);
                return;
            }

            const tag = checkJobStatusResponse(messageJson);

            if (tag) {
                socket.close();
                resolve(tag);
                return;
            }

            // If no tag is received, resolve and allow fall back to polling.
            resolve(undefined);
        });

        socket.addEventListener("error", () => {
            // No need to handle the error, we will fall back to polling.
            resolve(undefined);
        });
    });
}

async function pollJob(apiServiceUrl: string, ticket: string): Promise<string> {
    const options = {
        method: "GET",
        responseType: "json",
        headers: { "Content-Type": "application/json" },
    };

    let tag: string | undefined;

    while (!tag) {
        await delay(1000);
        let response: Response;

        try {
            response = await fetch(
                `${apiServiceUrl}/job/artifacts?ticket=${ticket}`,
                options
            );
        } catch {
            throw new Error(
                "A network error occurred checking the job status."
            );
        }

        if (!response.ok) {
            throw createError(response.statusText, response.status);
        }

        const responseJson = (await response.json()) as JobStatusResponse;
        tag = checkJobStatusResponse(responseJson);
    }

    return tag;
}

function checkJobStatusResponse(
    response: JobStatusResponse
): string | undefined {
    const results = response.results;
    const error = response.error;
    const genericErrorMessage = "The request could not be completed.";

    if (error) {
        throw createError(error.message, error.status);
    } else if (results) {
        const result = results.find(
            (result) => result["$type"] === "JobResult"
        );

        if (result) {
            return result.tag;
        }

        const quit = results.find((result) => result["$type"] === "JobQuit");

        if (quit) {
            const error = results.find(
                (result) => result["$type"] && result["$type"].endsWith("error")
            );
            const message = error?.message || genericErrorMessage;
            throw createError(message, error?.code);
        }
    } else {
        throw createError(genericErrorMessage);
    }

    return undefined;
}

function createError(statusText: string, status?: number): void {
    const message =
        typeof status === "number"
            ? `Error code: ${status}. Response error: "${statusText}"`
            : `Response error: "${statusText}"`;
    throw new Error(message);
}

function delay(ms = 0): Promise<void> {
    return new Promise<void>((resolve) => {
        setTimeout(resolve, ms);
    });
}

const DefaultPortalUrl = "https://www.arcgis.com";

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

interface ParameterMetadata extends Parameter {
    containsSingleValue?: boolean;
    description?: string;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    item?: any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    itemData?: any;
    purpose?: string;
    valueType?: string;
    visible?: boolean;
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

interface MetadataResponse {
    response: {
        parameters: ParameterMetadata[];
        controls: ControlResponse[];
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
interface ControlMetadata {
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

interface ControlResponse {
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
     * The height of the control.
     */
    height: number;

    /**
     * The width of the control.
     */
    width: number;

    units: "HundredsOfAnInch" | "TenthsOfAMillimeter";
}

/**
 * The parameters associated with a print template.
 */
export interface TemplateMetadata {
    /**
     * The PrintParameters associated with a print template.
     */
    parameters: ParameterMetadata[];

    /**
     * Metadata about the controls of a print template.
     */
    controls: ControlMetadata[];
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

    /**
     * A token used to authenticate with the service.
     */
    runToken?: string;

    /**
     * The url to the printing/reporting service. For example, "https://apps.vertigisstudio.com/reporting".
     */
    serviceUrl?: string;
}

const MM_PER_INCH = 25.4;

/**
 * Runs a VertiGIS Studio report or print.
 * @param itemId The portal item ID of the report item.
 * @param options The options that define the report to run and how to run it.
 * @returns A URL to the report output file.
 */
export async function run(
    itemId: string,
    options: RunOptions = {},
): Promise<string> {
    if (!itemId) {
        throw new Error("itemId is required.");
    }

    // Ensure the portal URL doesn't end with a trailing slash
    const portalUrl = options.portalUrl?.replace(/\/$/, "") || DefaultPortalUrl;

    let apiServiceUrl = "";

    if (!options.serviceUrl) {
        // Fetch the portal item info if we don't have a service url.
        const portalItemInfo = await getPortalItemInfo(
            itemId,
            portalUrl,
            options.token,
        );

        // Ensure it is a valid item
        if (!isValidItemType(portalItemInfo)) {
            throw new Error(
                `The item '${itemId}' is not a valid template type.`,
            );
        }
        if (!portalItemInfo.url) {
            throw new Error(
                `The item '${itemId}' does not contain a service URL.`,
            );
        }
        apiServiceUrl = `${ensureTrailingSlash(portalItemInfo.url)}`;
    } else {
        apiServiceUrl = `${ensureTrailingSlash(options.serviceUrl)}`;
    }

    // Authentication
    const bearerToken =
        options.runToken ??
        (await getRunToken(apiServiceUrl, portalUrl, options.token));

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
        options.format,
    );

    // Watch or poll the job
    const tag = await watchJob(apiServiceUrl, ticket, options.usePolling);

    // Assemble the URL to the completed report
    const downloadUrl = `${ensureTrailingSlash(
        apiServiceUrl,
    )}service/job/result?ticket=${ticket}&tag=${tag}`;
    return downloadUrl;
}

/** Gets the portal item info JSON
 * @param itemId The portal item ID of the report item.
 * @param portalUrl The URL of the ArcGIS Portal instance to use. Defaults to ArcGIS Online: "https://www.arcgis.com".
 * @param token An optional ArcGIS token for accessing a secured report.
 * If the report is secured, or accesses secured ArcGIS content the token is required.
 */
export async function getPortalItemInfo(
    itemId: string,
    portalUrl: string,
    token?: string,
): Promise<PortalItemResponse> {
    const url = `${ensureTrailingSlash(
        portalUrl,
    )}sharing/content/items/${itemId}?f=json&token=${token || ""}`;
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

/**
 * Gets the set of parameters required for a given print template.
 * @param itemId The portal item ID of the report item.
 * @param portalUrl The URL of the ArcGIS Portal instance to use. Defaults to ArcGIS Online: "https://www.arcgis.com".
 * @param serviceUrl The url to the template service.
 * @param runToken A token used to authenticate with the service.
 */
export async function getMetadata(
    itemId: string,
    portalUrl: string,
    serviceUrl: string,
    runToken?: string,
): Promise<TemplateMetadata> {
    const body = {
        template: {
            itemId,
            portalUrl,
        },
    };
    const headers = {
        "Content-Type": "application/json",
    };
    if (runToken) {
        headers["Authorization"] = `Bearer ${runToken}`;
    }
    const requestOptions = {
        method: "POST",
        responseType: "json",
        body: JSON.stringify(body),
        headers,
    };

    try {
        // Make the metadata request
        const response = await fetch(
            `${ensureTrailingSlash(serviceUrl)}service/job/metadata`,
            requestOptions,
        );

        if (!response.ok) {
            createError(response.statusText, response.status);
        }

        // Parse the response
        const responseJson = (await response.json()) as MetadataResponse;

        const data = responseJson.response;
        if (!data || !data.parameters) {
            throw new Error("The service did not provide any metadata.");
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
            `An error occurred. Unable to get template metadata. ${
                error as string
            }`,
        );
    }
}

/**
 * Marshals control metadata into ControlProperties.
 *
 * @param controls The source of control metadata.
 */
function marshalControlProperties(
    controls: ControlResponse[],
): ControlMetadata[] {
    const props: ControlMetadata[] = [];

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
            (x) => x === "Geocortex Printing" || x === "Geocortex Reporting",
        )
    );
}

/**
 * Gets a token from the printing/reporting service.
 * @param serviceUrl The url to the printing/reporting service.
 * @param portalUrl The URL of the ArcGIS Portal instance to use. Defaults to ArcGIS Online: "https://www.arcgis.com".
 * @param token An optional ArcGIS token for accessing a secured report.
 * If the report is secured, or accesses secured ArcGIS content the token is required.
 */
export async function getRunToken(
    serviceUrl: string,
    portalUrl: string,
    token: string | undefined,
): Promise<string> {
    if (!token) {
        return "";
    }

    const body = {
        accessToken: token,
        portalUrl: portalUrl || DefaultPortalUrl,
    };

    const options = {
        method: "POST",
        responseType: "json",
        body: JSON.stringify(body),
        headers: { "Content-Type": "application/json" },
    };
    let response: Response;

    try {
        response = await fetch(
            `${ensureTrailingSlash(serviceUrl)}service/auth/token/run`,
            options,
        );
    } catch {
        throw new Error(
            "A network error occurred fetching an authorization token.",
        );
    }

    if (!response.ok) {
        throw createError(response.statusText, response.status);
    }

    const responseJson = (await response.json()) as TokenResponse;

    return responseJson?.response?.token || "";
}

async function startJob(
    portalUrl: string,
    itemId: string,
    apiServiceUrl: string,
    runToken: string,
    parameters?: Record<
        string,
        SingleParameterValue | MultiParameterValue | MapValue
    >,
    culture?: string,
    dpi?: number,
    title?: string,
    format?: string,
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
            itemId,
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

    if (runToken) {
        requestOptions.headers["Authorization"] = `Bearer ${runToken}`;
    }

    let response: Response;

    try {
        response = await fetch(
            `${ensureTrailingSlash(apiServiceUrl)}service/job/run`,
            requestOptions,
        );
    } catch (e) {
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
    usePolling = false,
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
    ticket: string,
): Promise<string | undefined> {
    apiServiceUrl = apiServiceUrl.replace(/^http/, "ws");

    return new Promise<string | undefined>((resolve) => {
        const socket = new WebSocket(
            `${ensureTrailingSlash(
                apiServiceUrl,
            )}service/job/artifacts?ticket=${ticket}`,
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
                `${ensureTrailingSlash(
                    apiServiceUrl,
                )}service/job/artifacts?ticket=${ticket}`,
                options,
            );
        } catch {
            throw new Error(
                "A network error occurred checking the job status.",
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
    response: JobStatusResponse,
): string | undefined {
    const results = response.results;
    const error = response.error;
    const genericErrorMessage = "The request could not be completed.";

    if (error) {
        throw createError(error.message, error.status);
    } else if (results) {
        const result = results.find(
            (result) => result["$type"] === "JobResult",
        );

        if (result) {
            return result.tag;
        }

        const quit = results.find((result) => result["$type"] === "JobQuit");

        if (quit) {
            const error = results.find(
                (result) =>
                    result["$type"] && result["$type"].endsWith("error"),
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

function ensureTrailingSlash(url: string): string {
    if (!url.endsWith("/")) {
        url = url + "/";
    }
    return url;
}

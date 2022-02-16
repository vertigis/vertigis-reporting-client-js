# VertiGIS Studio Reporting Client for JavaScript

![CI/CD](https://github.com/geocortex/vertigis-reporting-client-js/workflows/CI/CD/badge.svg) ![npm](https://img.shields.io/npm/v/@vertigis/reporting-client)

This library makes it easy to run [VertiGIS Studio Reporting](https://www.vertigisstudio.com/products/vertigis-studio-reporting/) or [VertiGIS Studio Printing](https://www.vertigisstudio.com/products/vertigis-studio-printing/) jobs in the browser.

## Browser Support

The client supports the latest, stable releases of all major browsers. Internet Explorer 11 is not supported.

## Requirements

-   The latest LTS version of [Node.js](https://nodejs.org/en/download/)
-   A code editor of your choice. We recommend [Visual Studio Code](https://code.visualstudio.com/)

## Installing the package

This package is published to [npm](https://www.npmjs.com/package/@vertigis/reporting-client/), and can be installed using `npm`:

```sh
npm install @vertigis/reporting-client
```

## Generating a report

The client exports a `run` async function that will return a URL to the report upon completion.

```js
import { run } from "@vertigis/reporting-client";

const url = await run("itemId", options?);
```

### Options

| Option         | Type    | Description                                                                                                                                                                       |
| -------------- | ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| culture        | string  | The culture to use for localization. For example `"en-US"`.                                                                                                                       |
| dpi            | number  | The DPI to use when rendering a map print. Defaults to `96`.                                                                                                                      |
| parameters     | object  | An object specifying additional parameters to pass to the job.                                                                                                                    |
| portalUrl      | string  | The URL of the ArcGIS Portal instance to use. Defaults to ArcGIS Online: `"https://www.arcgis.com"`.                                                                              |
| resultFileName | string  | The name assigned to the output file. It is used as the name of the tab when viewing the result in a browser and as the suggested name when downloading the result.               |
| token          | string  | The Portal access token to be used to access secured resources. If not provided requests to secured resources will fail.                                                          |
| usePolling     | boolean | When `true`, check for results by polling the service. When `false`, check for results using WebSockets. It is recommended to use WebSockets where possible. Defaults to `false`. |

## Examples

### Run a report from ArcGIS Online

```js
const url = await run("itemId");
```

### Run a report from ArcGIS Enterprise

```js
const url = await run("itemId", {
    portalUrl: "https://server.domain.com/portal",
});
```

### Run a report with parameters

```js
const url = await run("itemId", {
    parameters: {
        Title: "My Title",
        FeatureIds: [1, 2, 3],
    },
});
```

Note: the parameter keys must mach the names of parameters that exist in the report.

### Run a secured report, or a report that accesses secured ArcGIS content

```js
const url = await run("itemId", {
    token: "eyJhbGciOiJIUzI1Ni...",
});
```

## Documentation

Find [further documentation on the SDK](https://developers.geocortex.com/docs/reporting/sdk-overview/) on the [VertiGIS Studio Developer Center](https://developers.geocortex.com/docs/reporting/overview/).

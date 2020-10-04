# Geocortex Reporting Client for JavaScript

![CI/CD](https://github.com/geocortex/geocortex-reporting-client-js/workflows/CI/CD/badge.svg) ![NPM](https://img.shields.io/npm/v/geocortex-reporting-client)

This library makes it easy to run [Geocortex Reporting](https://www.geocortex.com/products/geocortex-reporting/) or [Geocortex Printing](https://www.geocortex.com/products/geocortex-printing/) jobs.

## Requirements

-   The latest LTS version of [Node.js](https://nodejs.org/en/download/)
-   A code editor of your choice. We recommend [Visual Studio Code](https://code.visualstudio.com/)

## Installing the package

This package is published to [NPM](https://www.npmjs.com/package/@vertigis/geocortex-reporting-client/), and can be installed using `npm`:

```
npm install @vertigis/geocortex-reporting-client
```

## Generating a report

The client exports a `run` async function that will return a url to the report upon completion.

```
import { run } from "@vertigis/geocortex-reporting-client"

url = await run("itemid", [... other arguments])
```

### Arguments

`itemId` is required. All other arguments are optional.

| Argument       | Type | Description                                                                                                                                                                                                                    |
| -------------- | ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| itemId        | string  | The portal item ID of the Reporting or Printing item.                                                                                                                                                                          |
| portalUrl     | string  | The URL of the ArcGIS Portal instance to use. Defaults to ArcGIS Online: `"https://www.arcgis.com"`                                                                                                                            |
| parameters | any  | Other parameters to pass to the job. These are commonly used to parameterize your template. For example `run("itemid", "portalurl", { Title: "My Title", FeatureIds: [1, 2, 3] })`                                                                                  |
| token          | string  | The Portal access token to be used to access secured resources. If not provided requests to secured resources will fail.                                                                                                       |
| culture        | string  | The culture to use for localization. For example `"en-US"`.                                                                                                                                                                    |
| dpi            | number  | The DPI to use when rendering a map print. Defaults to `96`.                                                                                                                                                                   |
| usePolling    | boolean | When `true`, the job service will be polled periodically for results. When `false`, connect to the job service using WebSockets to listen for results. It's recommended to use WebSockets where possible. Defaults to `false`. |

## Documentation

Find [further documentation on the SDK](https://developers.geocortex.com/docs/reporting/sdk-overview/) on the [Geocortex Developer Center](https://developers.geocortex.com/docs/reporting/overview/)

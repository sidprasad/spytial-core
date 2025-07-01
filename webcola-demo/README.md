# CND WebCola Demo

This directory contains all files needed to run the WebCola Cope-and-Drag demo.

## How to Run

1. Bundle the React components.
```shell
npm run build:all
```
2. Serve the browser
```shell
npm run serve
```
3. Open http://localhost:8080/webcola-demo.html

## Components

### `CndLayoutInterface`

A React component that provides a toggle interface between Code View and No Code View for editing CND layout specifications.

#### Integration with HTML Demo

The component is designed to integrate with the existing `webcola-demo.html`. The `getCurrentCNDSpec()` function will expose the current CND spec as a YAML.

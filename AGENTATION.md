# Agentation for Astir

Agentation is a development-only annotation tool for Kate. It is not part of the Astir customer experience.

## Use it

1. Start the Agentation server:

```bash
npx -y agentation-mcp server
```

2. Open Astir with Agentation enabled:

```text
file:///Users/kate/Documents/Career%20app_July/index.html?agentation=1
```

3. Add notes in the Agentation toolbar.

The development loader mounts the real Agentation component with `endpoint: "http://localhost:4747"` so notes can be read by Codex through MCP.

## Turn it off

Refresh `index.html` without the `agentation=1` query string.

## Preview-state links

Always provide Kate with a build link that includes the preview-state toggle panel:

```text
http://localhost:5174/?demo=1
```

For Agentation notes plus preview states:

```text
http://localhost:5174/?demo=1&agentation=1
```

The demo panel must include toggles for important screen states. Current required states:

1. Home: no applications, at least 1 application.
2. Week: not set up, in progress, done and mixed goal states.
3. Pipeline: no entries, with entries.
4. All applications: no entries, with entries.

Deep links can request a specific preview:

```text
http://localhost:5174/?demo=pipelineEntries#pipeline
http://localhost:5174/?demo=applicationsEntries#applications
```

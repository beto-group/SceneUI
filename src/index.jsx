/**
 * SCENE UI - Index View Factory
 * Integrates FullTab stylesheet suppressor and reload command listener.
 */
async function View({ folderPath, isInception, dc, ...props }) {
    const STYLE_ID = "impeccable-status-sceneui";

    const Agent = {
        timer: null,
        start: function (fPath, onReload) {
            const cmdFile = fPath + "/data/mcp_commands.json";
            Agent.timer = setInterval(async function () {
                try {
                    const adapter = dc.app.vault.adapter;
                    if (!(await adapter.exists(cmdFile))) return;
                    const content = await adapter.read(cmdFile);
                    const cmd = JSON.parse(content);
                    if (cmd && cmd.executed === false && cmd.action === "reload") {
                        cmd.executed = true;
                        cmd.executedAt = new Date().toISOString();
                        await adapter.write(cmdFile, JSON.stringify(cmd, null, 2));
                        onReload();
                    }
                } catch (e) {
                    // Fail silently
                }
            }, 1000);
            return function () { clearInterval(Agent.timer); };
        }
    };

    function SafeRoot() {
        const [appComponent, setAppComponent] = dc.useState(null);
        const [error, setError] = dc.useState(null);
        const [key, setKey] = dc.useState(0);
        const [isFullTab, setIsFullTab] = dc.useState(!isInception);

        const toggleFullTab = function () {
            if (isInception) return;
            setIsFullTab(function (prev) { return !prev; });
        };

        // --- Immersive FullTab: Status Bar & Footer Suppression ---
        dc.useEffect(function () {
            if (!isFullTab || isInception) {
                const el = document.getElementById(STYLE_ID);
                if (el) el.remove();
                return;
            }

            let styleEl = document.getElementById(STYLE_ID);
            if (!styleEl) {
                styleEl = document.createElement("style");
                styleEl.id = STYLE_ID;
                styleEl.innerHTML = `
                    /* SCENE UI: Hide global status bar and view footers for immersive full-tab layout */
                    body > .app-container .status-bar,
                    .view-footer,
                    .workspace-leaf-content-footer {
                        display: none !important;
                    }
                    .workspace-leaf-content {
                        padding: 0 !important;
                        margin: 0 !important;
                        border-radius: 0 !important;
                    }
                `;
                document.head.appendChild(styleEl);
            }

            return function () {
                const el = document.getElementById(STYLE_ID);
                if (el) el.remove();
            };
        }, [isFullTab, isInception]);

        // --- Agent Watch Daemon ---
        dc.useEffect(function () {
            return Agent.start(folderPath, function () {
                if (dc.app.workspace.activeLeaf?.rebuildView) {
                    dc.app.workspace.activeLeaf.rebuildView();
                } else {
                    setKey(function (k) { return k + 1; });
                }
            });
        }, []);

        // --- Module Loader ---
        dc.useEffect(function () {
            async function load() {
                try {
                    const appModule = await dc.require(folderPath + "/src/App.jsx");
                    setAppComponent(function () { return appModule.App; });
                } catch (e) {
                    setError(e);
                }
            }
            load();
        }, [key]);

        if (error) {
            return (
                <div style={{ color: "var(--text-error, #ef4444)", padding: "40px", background: "var(--background-primary)", height: "100%" }}>
                    <h2>Critical Load Error</h2>
                    <pre style={{ fontSize: "12px", color: "var(--text-muted)" }}>{error.stack || error.message}</pre>
                </div>
            );
        }

        if (!appComponent) {
            return (
                <div style={{ padding: "40px", background: "var(--background-primary)", color: "var(--text-muted)", fontFamily: "monospace" }}>
                    Initializing Scene UI Workspace...
                </div>
            );
        }

        const MainApp = appComponent;
        return (
            <div id="datacore-component-root" style={{ width: "100%", height: isFullTab && !isInception ? "100%" : "600px", overflow: "hidden" }}>
                <MainApp
                    folderPath={folderPath}
                    dc={dc}
                    isFullTab={isFullTab && !isInception}
                    isInception={isInception}
                    onToggleFullTab={toggleFullTab}
                    {...props}
                />
            </div>
        );
    }

    return <SafeRoot />;
}

return { View };

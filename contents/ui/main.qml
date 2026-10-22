// © Mayanktaker Computers & Web Development | https://mayanktaker.com
// Root PlasmoidItem entry point managing state, data fetching timer, notifications, and representations

import QtQuick
import QtQml
import org.kde.plasma.plasmoid 2.0
import org.kde.plasma.core 2.0 as PlasmaCore
import org.kde.plasma.components 3.0 as PlasmaComponents
import "../code/api.js" as Api

PlasmoidItem {
    id: root

    // Shared curl-based network transport (QML XHR cannot send the Cookie header)
    UsageFetcher { id: usageFetcher }

    // Disable default Plasma popup frame to eliminate unwanted outer borders
    Plasmoid.backgroundHints: PlasmaCore.Types.NoBackground

    // State properties storing loaded usage data and UI flags
    property var usageData: null
    property int usagePercent: 0
    property bool isLoading: false
    property string errorMessage: ""
    property int lastAlertedPercent: 0
    // Local history store (trend chart + burn-rate chips), persisted in the config
    property var historyStore: ({ ws: "", samples: [] })

    // Compact representation component for panel tray placement
    compactRepresentation: Component {
        CompactRepresentation {
            usagePercent: root.usagePercent
        }
    }

    // Full representation component for expanded desktop popup view
    fullRepresentation: Component {
        FullRepresentation {
            usageData: root.usageData
            usagePercent: root.usagePercent
            errorMessage: root.errorMessage
            isLoading: root.isLoading
            historyStore: root.historyStore
            onRequestRefresh: root.refreshData()
        }
    }

    // Loads the persisted history for the current workspace (a new id resets the series)
    function loadHistory() {
        var wsId = Api.extractWorkspaceId(Plasmoid.configuration.workspaceId || "");
        historyStore = Api.historyFromConfig(Plasmoid.configuration.usageHistory || "", wsId);
    }

    // Function to execute async usage data refresh from OpenCode API
    function refreshData() {
        isLoading = true;
        errorMessage = "";
        
        var wsId = Plasmoid.configuration.workspaceId || "";
        var cookie = Plasmoid.configuration.authCookie || "";

        usageFetcher.fetch(wsId, cookie, function(err, data) {
            isLoading = false;
            if (err) {
                // Transient console outages keep the last known figures on screen
                var hasLiveFigures = usageData && !usageData.isMock;
                if (Api.isTransientError(err) && hasLiveFigures) {
                    errorMessage = "Console temporarily unavailable — showing last known figures.";
                } else {
                    errorMessage = err;
                    // If a real error occurred, clear mock data so the UI doesn't say "Demo Mode"
                    if (usageData && usageData.isMock) {
                        usageData = null;
                        usagePercent = 0;
                    }
                }
                // Send desktop notification if auth cookie has expired or is invalid
                var notifyEnabled = Plasmoid.configuration.enableNotifications !== false;
                var errLower = String(err || "").toLowerCase();
                if (notifyEnabled && (errLower.indexOf("cookie") !== -1 || errLower.indexOf("auth") !== -1 || errLower.indexOf("session") !== -1)) {
                    if (typeof Plasmoid.showNotification === "function") {
                        Plasmoid.showNotification("OpenCode Auth Alert", err, "dialog-warning");
                    }
                }
            } else {
                errorMessage = "";
            }
            if (data) {
                usageData = data;
                usagePercent = data.usagePercent || 0;

                // Live figures feed the local trend history; mock data never does,
                // and collection stops entirely when the privacy switch is off
                if (!data.isMock && Plasmoid.configuration.enableHistory !== false) {
                    var wsId = Api.extractWorkspaceId(Plasmoid.configuration.workspaceId || "");
                    historyStore = Api.historyAppend(historyStore, wsId, data, Date.now());
                    var nextJson = JSON.stringify(historyStore);
                    // Persist only when the store actually changed, to spare plasma config churn
                    if (nextJson !== Plasmoid.configuration.usageHistory) {
                        Plasmoid.configuration.usageHistory = nextJson;
                    }
                }

                // Send native desktop notification when usage threshold is exceeded
                var notifyEnabled = Plasmoid.configuration.enableNotifications !== false;
                var threshold = Plasmoid.configuration.notificationThreshold || 80;
                
                if (notifyEnabled && usagePercent >= threshold && lastAlertedPercent < threshold) {
                    lastAlertedPercent = usagePercent;
                    var title = "OpenCode Go Quota Warning";
                    var msg = "Subscription usage has reached " + usagePercent + "% (threshold: " + threshold + "%).";
                    if (typeof Plasmoid.showNotification === "function") {
                        Plasmoid.showNotification(title, msg, "dialog-warning");
                    } else if (typeof root.showPassiveNotification === "function") {
                        root.showPassiveNotification(msg, "short", "dialog-warning");
                    }
                    console.warn(title + ": " + msg);
                } else if (usagePercent < threshold) {
                    lastAlertedPercent = 0;
                }
            }
        });
    }

    // Timer handling periodic background data updates
    Timer {
        id: refreshTimer
        interval: Plasmoid.configuration.refreshInterval || 60000
        running: true
        repeat: true
        onTriggered: root.refreshData()
    }

    // Component initialization trigger
    Component.onCompleted: {
        root.loadHistory();
        root.refreshData();
    }

    // Connections listening for configuration updates from settings dialog
    Connections {
        target: Plasmoid.configuration

        // Handler for workspaceId configuration change
        function onWorkspaceIdChanged() {
            root.loadHistory();
            root.refreshData();
        }

        // Handler for authCookie configuration change
        function onAuthCookieChanged() {
            root.refreshData();
        }

        // Handler for refreshInterval configuration change
        function onRefreshIntervalChanged() {
            refreshTimer.interval = Plasmoid.configuration.refreshInterval || 60000;
            refreshTimer.restart();
        }
    }
}

// © Mayanktaker Computers & Web Development | https://mayanktaker.com
// Horizontal usage progress bars component displaying usage metrics as horizontal progress rows

import QtQuick
import QtQuick.Layouts
import QtQuick.Controls as QQC2
import org.kde.plasma.plasmoid 2.0
import org.kde.plasma.components 3.0 as PlasmaComponents
import org.kde.kirigami as Kirigami
import "../code/api.js" as Api

Item {
    id: horizontalRoot

    // Usage dataset and scale properties
    property var usageData: null
    property var historyStore: null
    property bool showIcons: Plasmoid.configuration.showBarIcons || false
    // Toggle for the per-window reset countdown brackets (Rolling/Weekly/Monthly)
    property bool showResetTimes: Plasmoid.configuration.showResetTimes || false
    property real uiScale: 1.0

    // Custom theme colors with vibrant cyan defaults
    property color barColor: Plasmoid.configuration.barColor || "#2dd4bf"
    property color barSecondaryColor: Plasmoid.configuration.barSecondaryColor || "#06b6d4"
    property color textColor: Plasmoid.configuration.textColor || "#cdd6f4"
    property color accentColor: Plasmoid.configuration.accentColor || "#f38ba8"
    property color backgroundColor: Plasmoid.configuration.backgroundColor || "#1e1e2e"

    property real contentPadding: Math.max(4, Math.round(4 * uiScale))
    implicitHeight: barsColumn.implicitHeight + contentPadding * 2

    // Helper function to calculate usage values and percentage
    function getIntervalMetrics(dataset) {
        if (!dataset || dataset.length === 0) return { used: 0, max: 100, pct: 0 };
        var lastItem = dataset[dataset.length - 1];
        var used = lastItem.value || 0;
        var max = lastItem.maxValue || 100;
        var pct = Math.min(100, Math.max(0, Math.round((used / max) * 100)));
        return { used: used, max: max, pct: pct };
    }

    // Helper function for percentage text color (highlights >=80% in amber/gold)
    function percentageTextColor(pct) {
        if (pct >= 80) return "#fbbf24";
        return horizontalRoot.textColor;
    }

    // Returns a natural-language reset countdown for a usage window, or "" when hidden or unknown
    function formatWindowReset(windowId) {
        if (!horizontalRoot.showResetTimes || !usageData || !usageData.resetSeconds) return "";
        return Api.formatResetFull(usageData.resetSeconds[windowId]);
    }

    // Burn-rate estimate for one window from the local history, or null
    function paceFor(windowId) {
        if (Plasmoid.configuration.enableHistory === false) return null;
        if (!historyStore || !usageData || !usageData.resetSeconds) return null;
        return Api.historyPace(historyStore, windowId, usageData.resetSeconds[windowId] || 0, Date.now());
    }

    // Chip color for a pace estimate: preset accent when the limit lands before reset
    function paceColor(pace) {
        if (!pace) return horizontalRoot.textColor;
        return pace.projectedPct >= 100 ? horizontalRoot.accentColor : horizontalRoot.textColor;
    }

    // Column container wrapping the three progress bar rows
    ColumnLayout {
        id: barsColumn
        anchors.left: parent.left
        anchors.right: parent.right
        anchors.top: parent.top
        anchors.leftMargin: contentPadding
        anchors.rightMargin: contentPadding
        anchors.topMargin: contentPadding
        spacing: Math.round(12 * uiScale)

        // Repeater for Rolling, Weekly, and Monthly usage windows.
        // "Rolling" alone is ambiguous, so its 5-hour window is spelled out as the console does.
        Repeater {
            model: [
                { id: "hourly", title: i18n("Rolling (5h)"), icon: "preferences-system-time", data: usageData ? usageData.hourly : [] },
                { id: "weekly", title: i18n("Weekly"), icon: "office-calendar", data: usageData ? usageData.weekly : [] },
                { id: "monthly", title: i18n("Monthly"), icon: "view-calendar", data: usageData ? usageData.monthly : [] }
            ]

            // Individual progress bar item container
            ColumnLayout {
                Layout.fillWidth: true
                spacing: Math.round(6 * uiScale)

                property var metrics: horizontalRoot.getIntervalMetrics(modelData.data)
                property var pace: horizontalRoot.paceFor(modelData.id)

                // Top label row: title on left, percentage on right
                RowLayout {
                    Layout.fillWidth: true
                    spacing: Math.round(4 * uiScale)

                    // Optional bar icon
                    Kirigami.Icon {
                        source: modelData.icon
                        implicitWidth: Math.round(12 * uiScale)
                        implicitHeight: Math.round(12 * uiScale)
                        color: horizontalRoot.textColor
                        visible: horizontalRoot.showIcons
                    }

                    // Usage interval title (Rolling / Weekly / Monthly)
                    PlasmaComponents.Label {
                        text: modelData.title
                        font.bold: true
                        font.pixelSize: Math.round(Kirigami.Units.gridUnit * 0.75 * uiScale)
                        color: horizontalRoot.textColor
                    }

                    // Per-window reset countdown bracket (e.g. "(reset in 3 hours 45 minutes)")
                    PlasmaComponents.Label {
                        visible: horizontalRoot.formatWindowReset(modelData.id) !== ""
                        text: "(" + i18n("reset in %1", horizontalRoot.formatWindowReset(modelData.id)) + ")"
                        // 80% of the standard label size so the countdown stays subordinate to the title
                        font.pixelSize: Math.round(Kirigami.Units.gridUnit * 0.48 * uiScale)
                        opacity: 0.6
                        color: horizontalRoot.textColor
                        // Let the layout shrink + elide this label instead of pushing the percentage off-card
                        elide: Text.ElideRight
                        Layout.minimumWidth: 0
                    }

                    // Burn-rate chip: projected percent at reset from the local history
                    PlasmaComponents.Label {
                        visible: pace !== null
                        text: pace !== null ? Api.historyPaceText(pace) : ""
                        font.pixelSize: Math.round(Kirigami.Units.gridUnit * 0.48 * uiScale)
                        color: pace !== null ? horizontalRoot.paceColor(pace) : horizontalRoot.textColor
                        opacity: pace !== null && pace.projectedPct >= 100 ? 1.0 : 0.7
                        elide: Text.ElideRight
                        Layout.minimumWidth: 0
                    }

                    Item { Layout.fillWidth: true }

                    // Usage percentage value text
                    Text {
                        text: metrics.pct + "%"
                        font.bold: true
                        font.pixelSize: Math.round(Kirigami.Units.gridUnit * 0.72 * uiScale)
                        color: horizontalRoot.percentageTextColor(metrics.pct)
                    }
                }

                // Progress bar track and animated fill
                MouseArea {
                    id: barMouseArea
                    Layout.fillWidth: true
                    implicitHeight: Math.round(12 * uiScale)
                    hoverEnabled: true

                    // Dark recessed track background
                    Rectangle {
                        anchors.fill: parent
                        radius: height / 2
                        color: Qt.darker(horizontalRoot.backgroundColor, 1.45)
                        border.color: barMouseArea.containsMouse ? horizontalRoot.accentColor : Qt.alpha(horizontalRoot.textColor, 0.12)
                        border.width: 1

                        // Gradient bar fill indicator
                        Rectangle {
                            id: fillBar
                            anchors.left: parent.left
                            anchors.top: parent.top
                            anchors.bottom: parent.bottom
                            anchors.margins: 1
                            radius: height / 2
                            width: Math.max(height, (parent.width - 2) * (metrics.pct / 100))

                            gradient: Gradient {
                                orientation: Gradient.Horizontal
                                GradientStop { position: 0.0; color: horizontalRoot.barColor }
                                GradientStop { position: 1.0; color: horizontalRoot.barSecondaryColor }
                            }

                            // Smooth width transition animation
                            Behavior on width {
                                NumberAnimation { duration: 400; easing.type: Easing.OutCubic }
                            }
                        }
                    }

                    QQC2.ToolTip.visible: barMouseArea.containsMouse
                    QQC2.ToolTip.delay: 100
                    QQC2.ToolTip.text: modelData.title + ": " + metrics.used + " of " + metrics.max + " (" + metrics.pct + "% used)"
                }
            }
        }
    }
}


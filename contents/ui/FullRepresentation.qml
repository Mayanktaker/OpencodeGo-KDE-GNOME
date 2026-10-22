// © Mayanktaker Computers & Web Development | https://mayanktaker.com
// Full expanded representation component displaying metrics, horizontal bars, reset header, and timestamp footer

import QtQuick
import QtQuick.Layouts
import QtQuick.Controls as QQC2
import org.kde.plasma.plasmoid 2.0
import org.kde.plasma.components 3.0 as PlasmaComponents
import org.kde.kirigami as Kirigami
import "../code/api.js" as Api

Rectangle {
    id: fullRoot

    // Layout mode is fixed to horizontal (tabbed/all-in-one views disabled)
    property string layoutMode: "horizontal"
    property bool isTabbed: false
    property bool isAllInOne: false
    property bool isHorizontal: true

    // State properties populated from main.qml
    property var usageData: null
    property int usagePercent: 0
    property string errorMessage: ""
    property bool isLoading: false
    property var historyStore: null
    signal requestRefresh()

    // Public scale factor and theme colors
    property color backgroundColor: Plasmoid.configuration.backgroundColor || "#1e1e2e"
    property color textColor: Plasmoid.configuration.textColor || "#cdd6f4"
    property color accentColor: Plasmoid.configuration.accentColor || "#f38ba8"

    // Layout-aware scale factor shared by responsive child components
    property real baseWidth: 320
    property real uiScale: Math.max(0.75, Math.min(1.5, width / baseWidth))
    // Shared card corner radius used by the widget frame and the full-bleed header stripe
    property real cardCornerRadius: Math.round(12 * uiScale)

    // Implicit and explicit height tied strictly to content column height to eliminate empty space at bottom
    implicitWidth: 320
    implicitHeight: usageHeader.height + contentColumn.implicitHeight + Math.round(24 * uiScale)
    height: implicitHeight

    Layout.minimumWidth: 260
    Layout.minimumHeight: implicitHeight
    Layout.preferredWidth: 320
    Layout.preferredHeight: implicitHeight
    Layout.maximumHeight: implicitHeight
    Layout.fillHeight: false




    color: backgroundColor
    radius: fullRoot.cardCornerRadius

    // Subtle top-to-bottom gradient for depth across all themes
    gradient: Gradient {
        GradientStop { position: 0.0; color: Qt.lighter(backgroundColor, 1.06) }
        GradientStop { position: 1.0; color: Qt.darker(backgroundColor, 1.04) }
    }

    // Connections listening for live configuration property updates
    Connections {
        target: Plasmoid.configuration
        function onDisplayLayoutChanged() {
            fullRoot.layoutMode = Plasmoid.configuration.displayLayout || "horizontal";
        }
    }

    // Full-bleed header strip spanning the card's full width at the top
    UsageHeader {
        id: usageHeader
        visible: Plasmoid.configuration.showTitle !== false
        anchors.top: parent.top
        anchors.left: parent.left
        anchors.right: parent.right
        planName: fullRoot.usageData ? fullRoot.usageData.planName : "OpenCode Go Usage Tracker"
        billingPeriod: fullRoot.usageData ? fullRoot.usageData.billingPeriod : "Current Cycle"
        usagePercent: fullRoot.usagePercent || 0
        isMock: fullRoot.usageData ? Boolean(fullRoot.usageData.isMock) : false
        isLoading: fullRoot.isLoading
        usageData: fullRoot.usageData
        uiScale: fullRoot.uiScale
        cardCornerRadius: fullRoot.cardCornerRadius
        onRequestRefresh: fullRoot.requestRefresh()
    }

    // Main column layout holding section label, horizontal bars, and footer
    ColumnLayout {
        id: contentColumn
        anchors.left: parent.left
        anchors.right: parent.right
        anchors.top: usageHeader.bottom
        anchors.leftMargin: Math.round(12 * uiScale)
        anchors.rightMargin: Math.round(12 * uiScale)
        anchors.topMargin: Math.round(12 * uiScale)
        spacing: Math.round(10 * uiScale)

        // Error message banner displayed when network or auth fails
        Rectangle {
            visible: fullRoot.errorMessage !== ""
            Layout.fillWidth: true
            implicitHeight: errorText.implicitHeight + 8
            radius: 4
            color: Qt.alpha("#ff5555", 0.15)
            border.color: "#ff5555"
            border.width: 1

            Text {
                id: errorText
                anchors.centerIn: parent
                width: parent.width - 16
                wrapMode: Text.WordWrap
                text: fullRoot.errorMessage
                font.pixelSize: Kirigami.Units.gridUnit * 0.5
                color: "#ff5555"
            }
        }

        // Horizontal Usage Bars component
        HorizontalUsageBars {
            id: horizontalBars
            visible: fullRoot.isHorizontal
            Layout.fillWidth: true
            Layout.fillHeight: false
            Layout.preferredHeight: horizontalBars.implicitHeight
            usageData: fullRoot.usageData
            historyStore: fullRoot.historyStore
            uiScale: fullRoot.uiScale
        }

        // 24-hour trend chart fed by the local history samples
        UsageTrendChart {
            id: trendChart
            Layout.fillWidth: true
            Layout.fillHeight: false
            Layout.preferredHeight: trendChart.implicitHeight
            historyStore: fullRoot.historyStore
            usageData: fullRoot.usageData
            uiScale: fullRoot.uiScale
        }

        // Footer — timestamp label and busy spinner
        RowLayout {
            Layout.fillWidth: true
            spacing: Math.round(4 * fullRoot.uiScale)

            // Busy indicator spinner when fetching data
            QQC2.BusyIndicator {
                implicitWidth: Math.round(12 * fullRoot.uiScale)
                implicitHeight: Math.round(12 * fullRoot.uiScale)
                running: fullRoot.isLoading
                visible: fullRoot.isLoading
            }

            // Text label displaying last refreshed timestamp
            PlasmaComponents.Label {
                Layout.fillWidth: true
                text: fullRoot.usageData
                    ? i18n("Last updated: %1", fullRoot.usageData.lastRefreshed)
                    : i18n("Loading...")
                font.pixelSize: Math.round(Kirigami.Units.gridUnit * 0.55 * fullRoot.uiScale)
                opacity: 0.5
                color: fullRoot.textColor
                // Ellipsize instead of wrapping when the card is at its narrowest width
                elide: Text.ElideRight
            }
        }
    }

    // Overlay card border drawn above the full-bleed header so showBorder keeps a full rounded edge
    Rectangle {
        anchors.fill: parent
        radius: fullRoot.cardCornerRadius
        color: "transparent"
        border.width: (Plasmoid.configuration.showBorder === true) ? 1 : 0
        border.color: (Plasmoid.configuration.showBorder === true) ? Qt.alpha(fullRoot.textColor, 0.3) : "transparent"
    }
}


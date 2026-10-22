// © Mayanktaker Computers & Web Development | https://mayanktaker.com
// 24-hour usage trend chart drawn on a Canvas, with a dashed threshold guide line

import QtQuick
import org.kde.plasma.plasmoid 2.0
import org.kde.plasma.components 3.0 as PlasmaComponents
import org.kde.kirigami as Kirigami
import "../code/api.js" as Api

Item {
    id: trendRoot

    // History store from main.qml plus the shared dataset and theme tokens
    property var historyStore: null
    property var usageData: null
    property real uiScale: 1.0
    property color textColor: Plasmoid.configuration.textColor || "#cdd6f4"
    property color barColor: Plasmoid.configuration.barColor || "#2dd4bf"
    property color barSecondaryColor: Plasmoid.configuration.barSecondaryColor || "#06b6d4"
    property color accentColor: Plasmoid.configuration.accentColor || "#f38ba8"

    // Alert guide line level matches the notification threshold
    property real guidePercent: Math.max(0, Math.min(100, Plasmoid.configuration.notificationThreshold || 80))

    // Chart geometry scaled with the card
    property real chartHeight: Math.round(46 * uiScale)
    implicitHeight: hasEnoughData ? titleRow.implicitHeight + canvas.height + legendLabel.implicitHeight + Math.round(10 * uiScale) : 0
    visible: hasEnoughData

    // The chart needs at least two weekly points (the headline series) and collection on
    property var weeklyPoints: historyStore ? Api.historyTrend(historyStore, "weekly", Date.now()) : []
    property bool hasEnoughData: Plasmoid.configuration.enableHistory !== false
        && Plasmoid.configuration.showTrend !== false
        && usageData && !usageData.isMock && weeklyPoints.length >= 2

    onWeeklyPointsChanged: canvas.requestPaint()
    // Theme or threshold edits must repaint the canvas, not wait for the next sample
    onTextColorChanged: canvas.requestPaint()
    onBarColorChanged: canvas.requestPaint()
    onBarSecondaryColorChanged: canvas.requestPaint()
    onAccentColorChanged: canvas.requestPaint()
    onGuidePercentChanged: canvas.requestPaint()

    // Title row: section label left, newest headline percentage right
    RowLayout {
        id: titleRow
        anchors.left: parent.left
        anchors.right: parent.right
        spacing: Math.round(4 * uiScale)

        PlasmaComponents.Label {
            text: i18n("Usage trend — last 24h")
            font.pixelSize: Math.round(Kirigami.Units.gridUnit * 0.5 * uiScale)
            font.bold: true
            opacity: 0.6
            color: trendRoot.textColor
        }

        Item { Layout.fillWidth: true }

        PlasmaComponents.Label {
            text: i18n("%1% now", weeklyPoints.length ? weeklyPoints[weeklyPoints.length - 1].pct : 0)
            font.pixelSize: Math.round(Kirigami.Units.gridUnit * 0.5 * uiScale)
            opacity: 0.6
            color: trendRoot.textColor
        }
    }

    // Canvas painting the three meter lines and the threshold guide
    Canvas {
        id: canvas
        anchors.left: parent.left
        anchors.right: parent.right
        anchors.top: titleRow.bottom
        anchors.topMargin: Math.round(4 * uiScale)
        height: trendRoot.chartHeight
        onPaint: {
            var cr = getContext("2d");
            cr.reset();
            var w = width, h = height;
            if (w <= 0 || h <= 0) return;

            // Shared time domain across all series keeps every line on one x scale
            var tMin = Infinity, tMax = -Infinity;
            var series = [];
            var defs = [
                { key: "hourly", color: trendRoot.barSecondaryColor, width: 1.2 },
                { key: "weekly", color: trendRoot.barColor, width: 2 },
                { key: "monthly", color: trendRoot.accentColor, width: 1.2 }
            ];
            for (var d = 0; d < defs.length; d++) {
                var pts = Api.historyTrend(trendRoot.historyStore, defs[d].key, Date.now());
                if (pts.length < 2) continue;
                series.push({ def: defs[d], pts: pts });
                tMin = Math.min(tMin, pts[0].t, pts[pts.length - 1].t);
                tMax = Math.max(tMax, pts[0].t, pts[pts.length - 1].t);
            }
            if (!series.length) return;

            var pad = 3;
            function xOf(t) { return pad + ((t - tMin) / Math.max(1, tMax - tMin)) * (w - pad * 2); }
            function yOf(pct) { return (h - pad) - (Math.max(0, Math.min(100, pct)) / 100) * (h - pad * 2); }

            // Dashed alert guide line at the notification threshold
            cr.strokeStyle = Qt.alpha(trendRoot.textColor, 0.35);
            cr.lineWidth = 1;
            cr.setLineDash([2, 4]);
            cr.beginPath();
            cr.moveTo(pad, yOf(trendRoot.guidePercent));
            cr.lineTo(w - pad, yOf(trendRoot.guidePercent));
            cr.stroke();
            cr.setLineDash([]);

            // One polyline per meter; weekly (the headline) draws thicker
            for (var s = 0; s < series.length; s++) {
                var entry = series[s];
                cr.strokeStyle = entry.def.color;
                cr.lineWidth = entry.def.width;
                cr.beginPath();
                cr.moveTo(xOf(entry.pts[0].t), yOf(entry.pts[0].pct));
                for (var i = 1; i < entry.pts.length; i++) {
                    cr.lineTo(xOf(entry.pts[i].t), yOf(entry.pts[i].pct));
                }
                cr.stroke();
            }
        }
    }

    // Legend naming each meter line with its newest percentage
    PlasmaComponents.Label {
        id: legendLabel
        anchors.left: parent.left
        anchors.right: parent.right
        anchors.top: canvas.bottom
        anchors.topMargin: Math.round(2 * uiScale)
        font.pixelSize: Math.round(Kirigami.Units.gridUnit * 0.46 * uiScale)
        opacity: 0.55
        color: trendRoot.textColor
        elide: Text.ElideRight
        text: {
            if (!historyStore) return "";
            var parts = [];
            var names = { hourly: i18n("Rolling"), weekly: i18n("Weekly"), monthly: i18n("Monthly") };
            var keys = ["hourly", "weekly", "monthly"];
            for (var i = 0; i < keys.length; i++) {
                var pts = Api.historyTrend(historyStore, keys[i], Date.now());
                if (pts.length) parts.push(names[keys[i]] + " " + pts[pts.length - 1].pct + "%");
            }
            return parts.join(" · ");
        }
    }
}

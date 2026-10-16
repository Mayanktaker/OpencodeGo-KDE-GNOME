// © Mayanktaker Computers & Web Development | https://mayanktaker.com
// General settings tab QML layout for Workspace ID, Auth Cookie, Refresh interval, and Notifications

import QtQuick
import QtQuick.Controls as QQC2
import QtQuick.Layouts
import org.kde.kirigami as Kirigami
import "../code/api.js" as Api

Item {
    id: configGeneralRoot
    Layout.fillWidth: true
    implicitHeight: formLayout.implicitHeight + 40

    // Shared curl-based network transport (QML XHR cannot send the Cookie header)
    UsageFetcher { id: usageFetcher }

    // Test connection state properties for the Validate button feedback
    property bool testingConnection: false
    property string testResultText: ""
    property bool testSucceeded: false

    // Sends a live request with the current settings to validate workspace ID and cookie
    function testConnection() {
        configGeneralRoot.testingConnection = true;
        configGeneralRoot.testResultText = "";
        usageFetcher.fetch(workspaceIdField.text, authCookieField.text, function(err, data) {
            configGeneralRoot.testingConnection = false;
            if (err) {
                configGeneralRoot.testSucceeded = false;
                configGeneralRoot.testResultText = i18n("Failed: %1", err);
                return;
            }
            if (data && data.isMock) {
                configGeneralRoot.testSucceeded = false;
                configGeneralRoot.testResultText = i18n("Enter a Workspace ID and Auth Cookie to authenticate.");
                return;
            }
            configGeneralRoot.testSucceeded = true;
            var resetSec = (data.resetSeconds && data.resetSeconds.weekly) ? data.resetSeconds.weekly : 0;
            configGeneralRoot.testResultText = resetSec > 0
                ? i18n("Connected — %1% of weekly quota used (resets in %2)", data.usagePercent || 0, Api.formatResetFull(resetSec))
                : i18n("Connected — %1% of weekly quota used", data.usagePercent || 0);
        });
    }

    // Configuration property aliases bound automatically via cfg_ prefix to main.xml
    property alias cfg_workspaceId: workspaceIdField.text
    property alias cfg_authCookie: authCookieField.text
    property alias cfg_refreshInterval: refreshIntervalField.value
    property alias cfg_enableNotifications: enableNotifyCheckBox.checked
    property alias cfg_enableSound: enableSoundCheckBox.checked
    property alias cfg_notificationThreshold: thresholdSpinBox.value
    property alias cfg_showBarIcons: showBarIconsCheckBox.checked

    Kirigami.FormLayout {
        id: formLayout
        anchors.left: parent.left
        anchors.right: parent.right
        anchors.top: parent.top
        anchors.margins: 16

        // Hidden spinbox backing refreshInterval alias for KQuickConfigModule
        QQC2.SpinBox {
            id: refreshIntervalField
            visible: false
            from: 0
            to: 999999999
        }

        // Workspace ID input field with automatic URL extraction when pasting a full console link
        QQC2.TextField {
            id: workspaceIdField
            Kirigami.FormData.label: i18n("Workspace ID:")
            placeholderText: i18n("e.g. wrk_01KE20AQRQ9QR7N15TWGJBE2V9 or Console URL")
            Layout.fillWidth: true
            onTextEdited: {
                var extracted = Api.extractWorkspaceId(text);
                if (extracted && extracted !== text.trim() && /^(wrk_|org_)/.test(extracted)) {
                    text = extracted;
                }
            }
        }

        // Auth session cookie input field
        QQC2.TextField {
            id: authCookieField
            Kirigami.FormData.label: i18n("Auth Cookie:")
            placeholderText: i18n("Paste __Host-console_session from opencode.ai")
            echoMode: QQC2.TextField.Password
            Layout.fillWidth: true
        }

        // Live credential validation button and status feedback row
        RowLayout {
            Kirigami.FormData.label: i18n("Validate:")
            Layout.fillWidth: true
            spacing: 8

            QQC2.Button {
                id: testConnectionButton
                text: configGeneralRoot.testingConnection ? i18n("Testing...") : i18n("Test Connection")
                enabled: !configGeneralRoot.testingConnection
                icon.name: "network-connect"
                onClicked: configGeneralRoot.testConnection()
            }

            QQC2.Label {
                id: testResultLabel
                Layout.fillWidth: true
                visible: configGeneralRoot.testResultText !== ""
                color: configGeneralRoot.testSucceeded ? "#2e7d32" : "#c62828"
                font.pixelSize: Kirigami.Units.gridUnit * 0.55
                text: configGeneralRoot.testResultText
            }
        }



        // Auto-refresh interval selection combo box
        QQC2.ComboBox {
            id: refreshIntervalCombo
            Kirigami.FormData.label: i18n("Refresh Interval:")
            textRole: "text"
            valueRole: "value"
            model: [
                { text: i18n("30 Seconds"), value: 30000 },
                { text: i18n("1 Minute"), value: 60000 },
                { text: i18n("5 Minutes"), value: 300000 },
                { text: i18n("10 Minutes"), value: 600000 }
            ]

            currentIndex: {
                var val = refreshIntervalField.value || 60000;
                for (var i = 0; i < model.length; i++) {
                    if (model[i].value === val) return i;
                }
                return 1;
            }

            onActivated: {
                refreshIntervalField.value = currentValue;
            }
        }

        // Enable desktop quota alerts checkbox
        QQC2.CheckBox {
            id: enableNotifyCheckBox
            Kirigami.FormData.label: i18n("Quota Alerts:")
            text: i18n("Send desktop notification when usage threshold is exceeded")
        }

        // Enable notification sound chime checkbox
        QQC2.CheckBox {
            id: enableSoundCheckBox
            Kirigami.FormData.label: i18n("Notification Sound:")
            visible: enableNotifyCheckBox.checked
            text: i18n("Play audible notification chime when quota alert triggers")
        }

        // Quota alert percentage threshold spinbox
        RowLayout {
            Kirigami.FormData.label: i18n("Alert Threshold:")
            visible: enableNotifyCheckBox.checked
            spacing: 6

            QQC2.SpinBox {
                id: thresholdSpinBox
                from: 10
                to: 100
                stepSize: 5
                editable: true
            }

            QQC2.Label {
                text: i18n("% of plan quota")
            }
        }

        // Show icons next to bar labels checkbox
        QQC2.CheckBox {
            id: showBarIconsCheckBox
            Kirigami.FormData.label: i18n("Bar Icons:")
            text: i18n("Show icons next to Rolling / Weekly / Monthly labels")
        }

        // Help instruction card box
        Kirigami.InlineMessage {
            Layout.fillWidth: true
            type: Kirigami.Information
            visible: true
            text: i18n("To configure the widget:\n1. Open your workspace in the OpenCode Console (opencode.ai/console/wrk_.../go) and sign in.\n2. Copy the Workspace ID from the URL — it starts with 'wrk_' (e.g. wrk_01KE20AQRQ9QR7N15TWGJBE2V9).\n3. Press F12 -> Application (or Storage) -> Cookies -> opencode.ai -> copy the entire '__Host-console_session' cookie value (a short token, about 39 characters).\n4. Paste both values above, then click Test Connection.\n5. Leave the fields empty to return to Demo Mode.")
        }
    }
}

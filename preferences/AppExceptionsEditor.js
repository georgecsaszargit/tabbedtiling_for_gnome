// ./preferences/AppExceptionsEditor.js
import Adw from 'gi://Adw';
import Gtk from 'gi://Gtk';
import GObject from 'gi://GObject';
import { gettext as _ } from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

const APP_NAME_EXCEPTIONS_KEY = 'app-name-exceptions';
const log = msg => console.log(`[AutoZonerPrefs.AppExceptionsEditor] ${msg}`);

export class AppExceptionEditorRow extends Adw.ActionRow {
    static {
        GObject.registerClass({
            Signals: {
                'remove-requested': {},
                'changed': {}
            }
        }, this);
    }

    constructor(exceptionData) {
        super({
            title: exceptionData.appId || _('New Exception'),
        });

        this._data = { ...exceptionData };

        // App ID Entry
        this._appIdEntry = new Gtk.Entry({
            text: this._data.appId || '',
            placeholder_text: _('e.g., firefox.desktop'),
            hexpand: true,
            tooltip_text: _('The application ID (usually ends with .desktop)')
        });
        this._appIdEntry.connect('changed', () => {
            this._data.appId = this._appIdEntry.get_text();
            this.title = this._data.appId || _('New Exception');
            this.emit('changed');
        });

        // Word Count Spin Button
        this._wordCountSpin = Gtk.SpinButton.new_with_range(1, 10, 1);
        this._wordCountSpin.set_value(this._data.wordCount || 1);
        this._wordCountSpin.set_tooltip_text(_('Number of words to take from window title'));
        this._wordCountSpin.connect('value-changed', () => {
            this._data.wordCount = this._wordCountSpin.get_value_as_int();
            this.emit('changed');
        });

        // Remove Button
        const removeButton = new Gtk.Button({
            icon_name: 'edit-delete-symbolic',
            valign: Gtk.Align.CENTER,
            tooltip_text: _('Remove this exception'),
            css_classes: ['flat', 'circular', 'destructive-action']
        });
        removeButton.connect('clicked', () => {
            this.emit('remove-requested');
        });

        // Layout
        const contentBox = new Gtk.Box({
            orientation: Gtk.Orientation.HORIZONTAL,
            spacing: 12,
            margin_top: 6,
            margin_bottom: 6,
            margin_start: 6,
            margin_end: 6
        });

        const appIdBox = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL,
            spacing: 3,
            hexpand: true
        });
        appIdBox.append(new Gtk.Label({
            label: _('Application ID:'),
            halign: Gtk.Align.START,
            css_classes: ['caption']
        }));
        appIdBox.append(this._appIdEntry);

        const wordCountBox = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL,
            spacing: 3
        });
        wordCountBox.append(new Gtk.Label({
            label: _('Words:'),
            halign: Gtk.Align.START,
            css_classes: ['caption']
        }));
        wordCountBox.append(this._wordCountSpin);

        contentBox.append(appIdBox);
        contentBox.append(wordCountBox);
        contentBox.append(removeButton);

        this.set_child(contentBox);
        this.set_activatable_widget(this._appIdEntry);
    }

    getData() {
        return { ...this._data };
    }

    isValid() {
        return this._data.appId && this._data.appId.trim().length > 0 && this._data.wordCount > 0;
    }
}

export class AppExceptionsEditor {
    constructor(settings, window) {
        this._settings = settings;
        this._window = window;
        
        this.group = new Adw.PreferencesGroup({
            title: _('Application Name Exceptions'),
            description: _('Configure which applications should use window titles instead of application names in tab labels, and specify how many words to display from the title.')
        });

        this._listBox = new Gtk.ListBox({
            selection_mode: Gtk.SelectionMode.NONE,
            css_classes: ['boxed-list']
        });

        this._addButton = new Gtk.Button({
            label: _('Add Exception'),
            halign: Gtk.Align.CENTER,
            css_classes: ['suggested-action'],
            margin_top: 12
        });
        this._addButton.connect('clicked', () => this._addException());

        // Info section with examples
        const infoExpander = new Adw.ExpanderRow({
            title: _('How it works'),
            subtitle: _('Click to see examples and explanation')
        });

        const infoBox = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL,
            spacing: 12,
            margin_top: 12,
            margin_bottom: 12,
            margin_start: 12,
            margin_end: 12
        });

        const explanationLabel = new Gtk.Label({
            label: _('By default, tabs show the application name (e.g., "Firefox" for all Firefox windows). ' +
                   'Exceptions allow specific applications to show part of their window title instead.\n\n' +
                   'Examples:\n' +
                   '• firefox.desktop with 2 words: "Gmail - Mozilla" → "Gmail -"\n' +
                   '• code.desktop with 1 word: "main.js - Visual Studio Code" → "main.js"\n' +
                   '• virt-manager.desktop with 3 words: "Ubuntu 20.04 - Virtual Machine Manager" → "Ubuntu 20.04 -"'),
            wrap: true,
            xalign: 0,
            css_classes: ['body']
        });

        const findAppIdLabel = new Gtk.Label({
            label: _('<b>Finding Application IDs:</b>\nRun <tt>ls /usr/share/applications/</tt> in terminal, or check the app\'s .desktop file name.'),
            wrap: true,
            use_markup: true,
            xalign: 0,
            css_classes: ['caption']
        });

        infoBox.append(explanationLabel);
        infoBox.append(new Gtk.Separator());
        infoBox.append(findAppIdLabel);
        infoExpander.add_row(new Adw.ActionRow({ child: infoBox }));

        // Add components to group
        this.group.add(infoExpander);
        this.group.add(this._listBox);
        this.group.add(this._addButton);

        this._loadExceptions();
    }

    getWidget() {
        return this.group;
    }

    _loadExceptions() {
        // Clear existing rows
        let child = this._listBox.get_first_child();
        while (child) {
            const next = child.get_next_sibling();
            this._listBox.remove(child);
            child = next;
        }

        let exceptions = [];
        try {
            const str = this._settings.get_string(APP_NAME_EXCEPTIONS_KEY);
            exceptions = JSON.parse(str);
            if (!Array.isArray(exceptions)) exceptions = [];
        } catch (e) {
            log(`Error parsing exceptions JSON: ${e}`);
            exceptions = [];
        }

        exceptions.forEach(exceptionData => {
            this._createAndAddExceptionRow(exceptionData);
        });

        log(`Loaded ${exceptions.length} exceptions into GUI.`);
    }

    _createAndAddExceptionRow(exceptionData) {
        const row = new AppExceptionEditorRow(exceptionData);
        
        row.connect('changed', () => {
            this._saveExceptions();
        });

        row.connect('remove-requested', () => {
            const dialog = new Adw.MessageDialog({
                heading: _('Remove Exception?'),
                body: _('Are you sure you want to remove the exception for "%s"?').format(exceptionData.appId || _('this application')),
                transient_for: this._window.get_root(),
                modal: true
            });
            dialog.add_response('cancel', _('Cancel'));
            dialog.add_response('remove', _('Remove'));
            dialog.set_response_appearance('remove', Adw.ResponseAppearance.DESTRUCTIVE);
            
            dialog.connect('response', (d, resp) => {
                if (resp === 'remove') {
                    this._listBox.remove(row);
                    this._saveExceptions();
                }
                d.destroy();
            });
            dialog.present();
        });

        this._listBox.append(row);
    }

    _addException() {
        const newException = {
            appId: '',
            wordCount: 1
        };
        this._createAndAddExceptionRow(newException);
        this._saveExceptions();
    }

    _saveExceptions() {
        const exceptions = [];
        let child = this._listBox.get_first_child();
        
        while (child) {
            if (child instanceof AppExceptionEditorRow) {
                const data = child.getData();
                if (child.isValid()) {
                    exceptions.push({
                        appId: data.appId.trim(),
                        wordCount: Math.max(1, Math.floor(data.wordCount))
                    });
                }
            }
            child = child.get_next_sibling();
        }

        this._settings.set_string(APP_NAME_EXCEPTIONS_KEY, JSON.stringify(exceptions));
        log(`Saved ${exceptions.length} exceptions.`);
    }
}

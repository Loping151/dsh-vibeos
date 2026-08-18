import { z } from 'zod';
import type { ClientToServer } from './c2s';
export declare const clientToServerSchema: z.ZodDiscriminatedUnion<[z.ZodObject<{
    type: z.ZodLiteral<"c2s.boot.hello">;
    payload: z.ZodObject<{
        clientId: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>;
}, z.core.$strip>, z.ZodObject<{
    type: z.ZodLiteral<"c2s.op">;
    payload: z.ZodObject<{
        windowId: z.ZodString;
        op: z.ZodObject<{
            kind: z.ZodEnum<{
                custom: "custom";
                click: "click";
                input: "input";
                submit: "submit";
                change: "change";
                key: "key";
            }>;
            action: z.ZodOptional<z.ZodString>;
            sel: z.ZodOptional<z.ZodString>;
            dataset: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodString>>;
            value: z.ZodOptional<z.ZodString>;
            formData: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodString>>;
        }, z.core.$strip>;
    }, z.core.$strip>;
}, z.core.$strip>, z.ZodObject<{
    type: z.ZodLiteral<"c2s.op.dragdrop">;
    payload: z.ZodObject<{
        windowId: z.ZodOptional<z.ZodString>;
        source: z.ZodObject<{
            kind: z.ZodEnum<{
                file: "file";
                text: "text";
                image: "image";
                "desktop-object": "desktop-object";
                "app-shortcut": "app-shortcut";
            }>;
            ref: z.ZodString;
            label: z.ZodOptional<z.ZodString>;
        }, z.core.$strip>;
        target: z.ZodObject<{
            windowId: z.ZodOptional<z.ZodString>;
            action: z.ZodOptional<z.ZodString>;
            sel: z.ZodOptional<z.ZodString>;
        }, z.core.$strip>;
    }, z.core.$strip>;
}, z.core.$strip>, z.ZodObject<{
    type: z.ZodLiteral<"c2s.window.open">;
    payload: z.ZodObject<{
        appId: z.ZodString;
        hint: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>;
}, z.core.$strip>, z.ZodObject<{
    type: z.ZodLiteral<"c2s.window.close">;
    payload: z.ZodObject<{
        windowId: z.ZodString;
    }, z.core.$strip>;
}, z.core.$strip>, z.ZodObject<{
    type: z.ZodLiteral<"c2s.window.focus">;
    payload: z.ZodObject<{
        windowId: z.ZodString;
    }, z.core.$strip>;
}, z.core.$strip>, z.ZodObject<{
    type: z.ZodLiteral<"c2s.window.minimize">;
    payload: z.ZodObject<{
        windowId: z.ZodString;
    }, z.core.$strip>;
}, z.core.$strip>, z.ZodObject<{
    type: z.ZodLiteral<"c2s.window.maximize">;
    payload: z.ZodObject<{
        windowId: z.ZodString;
    }, z.core.$strip>;
}, z.core.$strip>, z.ZodObject<{
    type: z.ZodLiteral<"c2s.window.move">;
    payload: z.ZodObject<{
        windowId: z.ZodString;
        x: z.ZodNumber;
        y: z.ZodNumber;
        w: z.ZodNumber;
        h: z.ZodNumber;
    }, z.core.$strip>;
}, z.core.$strip>, z.ZodObject<{
    type: z.ZodLiteral<"c2s.window.reorder">;
    payload: z.ZodObject<{
        ids: z.ZodArray<z.ZodString>;
    }, z.core.$strip>;
}, z.core.$strip>, z.ZodObject<{
    type: z.ZodLiteral<"c2s.window.undo">;
    payload: z.ZodObject<{
        windowId: z.ZodString;
    }, z.core.$strip>;
}, z.core.$strip>, z.ZodObject<{
    type: z.ZodLiteral<"c2s.window.redo">;
    payload: z.ZodObject<{
        windowId: z.ZodString;
    }, z.core.$strip>;
}, z.core.$strip>, z.ZodObject<{
    type: z.ZodLiteral<"c2s.vfs.move">;
    payload: z.ZodObject<{
        nodeId: z.ZodString;
        location: z.ZodEnum<{
            desktop: "desktop";
            folder: "folder";
            recyclebin: "recyclebin";
        }>;
        x: z.ZodOptional<z.ZodNumber>;
        y: z.ZodOptional<z.ZodNumber>;
        parentId: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>;
}, z.core.$strip>, z.ZodObject<{
    type: z.ZodLiteral<"c2s.vfs.open">;
    payload: z.ZodObject<{
        nodeId: z.ZodString;
    }, z.core.$strip>;
}, z.core.$strip>, z.ZodObject<{
    type: z.ZodLiteral<"c2s.vfs.delete">;
    payload: z.ZodObject<{
        nodeId: z.ZodString;
    }, z.core.$strip>;
}, z.core.$strip>, z.ZodObject<{
    type: z.ZodLiteral<"c2s.vfs.empty">;
    payload: z.ZodObject<{}, z.core.$strip>;
}, z.core.$strip>, z.ZodObject<{
    type: z.ZodLiteral<"c2s.settings.update">;
    payload: z.ZodObject<{
        partial: z.ZodRecord<z.ZodString, z.ZodUnknown>;
    }, z.core.$strip>;
}, z.core.$strip>, z.ZodObject<{
    type: z.ZodLiteral<"c2s.app.uninstall">;
    payload: z.ZodObject<{
        appId: z.ZodString;
    }, z.core.$strip>;
}, z.core.$strip>, z.ZodObject<{
    type: z.ZodLiteral<"c2s.wallpaper.upload">;
    payload: z.ZodObject<{
        dataUrl: z.ZodString;
    }, z.core.$strip>;
}, z.core.$strip>, z.ZodObject<{
    type: z.ZodLiteral<"c2s.notification.read">;
    payload: z.ZodObject<{
        id: z.ZodString;
    }, z.core.$strip>;
}, z.core.$strip>, z.ZodObject<{
    type: z.ZodLiteral<"c2s.notification.click">;
    payload: z.ZodObject<{
        id: z.ZodString;
    }, z.core.$strip>;
}, z.core.$strip>, z.ZodObject<{
    type: z.ZodLiteral<"c2s.app.search">;
    payload: z.ZodObject<{
        query: z.ZodString;
        requestId: z.ZodString;
    }, z.core.$strip>;
}, z.core.$strip>, z.ZodObject<{
    type: z.ZodLiteral<"c2s.command.run">;
    payload: z.ZodObject<{
        text: z.ZodString;
        requestId: z.ZodString;
    }, z.core.$strip>;
}, z.core.$strip>, z.ZodObject<{
    type: z.ZodLiteral<"c2s.app.launch">;
    payload: z.ZodObject<{
        name: z.ZodString;
        description: z.ZodOptional<z.ZodString>;
        icon: z.ZodOptional<z.ZodString>;
        widget: z.ZodOptional<z.ZodBoolean>;
    }, z.core.$strip>;
}, z.core.$strip>, z.ZodObject<{
    type: z.ZodLiteral<"c2s.app.save">;
    payload: z.ZodObject<{
        windowId: z.ZodString;
        name: z.ZodOptional<z.ZodString>;
        icon: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>;
}, z.core.$strip>, z.ZodObject<{
    type: z.ZodLiteral<"c2s.app.export">;
    payload: z.ZodObject<{
        appId: z.ZodString;
    }, z.core.$strip>;
}, z.core.$strip>, z.ZodObject<{
    type: z.ZodLiteral<"c2s.app.import">;
    payload: z.ZodObject<{
        json: z.ZodString;
    }, z.core.$strip>;
}, z.core.$strip>, z.ZodObject<{
    type: z.ZodLiteral<"c2s.activity.fetch">;
    payload: z.ZodObject<{
        before: z.ZodOptional<z.ZodNumber>;
        limit: z.ZodOptional<z.ZodNumber>;
    }, z.core.$strip>;
}, z.core.$strip>, z.ZodObject<{
    type: z.ZodLiteral<"c2s.activity.stop">;
    payload: z.ZodObject<{
        runId: z.ZodString;
    }, z.core.$strip>;
}, z.core.$strip>, z.ZodObject<{
    type: z.ZodLiteral<"c2s.models.list">;
    payload: z.ZodObject<{}, z.core.$strip>;
}, z.core.$strip>, z.ZodObject<{
    type: z.ZodLiteral<"c2s.system.reset">;
    payload: z.ZodObject<{}, z.core.$strip>;
}, z.core.$strip>, z.ZodObject<{
    type: z.ZodLiteral<"c2s.session.list">;
    payload: z.ZodObject<{}, z.core.$strip>;
}, z.core.$strip>, z.ZodObject<{
    type: z.ZodLiteral<"c2s.session.restore">;
    payload: z.ZodObject<{
        id: z.ZodString;
    }, z.core.$strip>;
}, z.core.$strip>, z.ZodObject<{
    type: z.ZodLiteral<"c2s.session.export">;
    payload: z.ZodObject<{
        id: z.ZodString;
    }, z.core.$strip>;
}, z.core.$strip>, z.ZodObject<{
    type: z.ZodLiteral<"c2s.session.import">;
    payload: z.ZodObject<{
        json: z.ZodString;
    }, z.core.$strip>;
}, z.core.$strip>], "type">;
/** Validate an inbound `{ type, payload }`; returns the typed message or null. */
export declare function parseClientMessage(input: unknown): ClientToServer | null;

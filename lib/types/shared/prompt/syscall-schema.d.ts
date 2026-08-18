import { z } from 'zod';
/**
 * Zod schemas validating the AI's structured output (the syscall block).
 * HOST-ONLY value import: never pull this module into the client bundle.
 */
export declare const notificationKindSchema: z.ZodEnum<{
    error: "error";
    info: "info";
    success: "success";
    warning: "warning";
}>;
export declare const vfsLocationSchema: z.ZodEnum<{
    desktop: "desktop";
    folder: "folder";
    recyclebin: "recyclebin";
}>;
export declare const syscallSchema: z.ZodDiscriminatedUnion<[z.ZodObject<{
    type: z.ZodLiteral<"notify">;
    title: z.ZodString;
    body: z.ZodOptional<z.ZodString>;
    kind: z.ZodOptional<z.ZodEnum<{
        error: "error";
        info: "info";
        success: "success";
        warning: "warning";
    }>>;
}, z.core.$strip>, z.ZodObject<{
    type: z.ZodLiteral<"open">;
    appId: z.ZodString;
}, z.core.$strip>, z.ZodObject<{
    type: z.ZodLiteral<"spawn-window">;
    title: z.ZodString;
    prompt: z.ZodString;
    appId: z.ZodOptional<z.ZodString>;
    width: z.ZodOptional<z.ZodNumber>;
    height: z.ZodOptional<z.ZodNumber>;
}, z.core.$strip>, z.ZodObject<{
    type: z.ZodLiteral<"install">;
    name: z.ZodString;
    icon: z.ZodOptional<z.ZodString>;
    manifest: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
}, z.core.$strip>, z.ZodObject<{
    type: z.ZodLiteral<"create-file">;
    name: z.ZodString;
    mime: z.ZodOptional<z.ZodString>;
    content: z.ZodOptional<z.ZodString>;
    location: z.ZodOptional<z.ZodEnum<{
        desktop: "desktop";
        folder: "folder";
        recyclebin: "recyclebin";
    }>>;
}, z.core.$strip>, z.ZodObject<{
    type: z.ZodLiteral<"focus">;
    windowId: z.ZodString;
}, z.core.$strip>, z.ZodObject<{
    type: z.ZodLiteral<"close">;
    windowId: z.ZodString;
}, z.core.$strip>, z.ZodObject<{
    type: z.ZodLiteral<"chrome">;
    set: z.ZodRecord<z.ZodString, z.ZodString>;
}, z.core.$strip>], "type">;
export declare const syscallBatchSchema: z.ZodObject<{
    calls: z.ZodDefault<z.ZodArray<z.ZodDiscriminatedUnion<[z.ZodObject<{
        type: z.ZodLiteral<"notify">;
        title: z.ZodString;
        body: z.ZodOptional<z.ZodString>;
        kind: z.ZodOptional<z.ZodEnum<{
            error: "error";
            info: "info";
            success: "success";
            warning: "warning";
        }>>;
    }, z.core.$strip>, z.ZodObject<{
        type: z.ZodLiteral<"open">;
        appId: z.ZodString;
    }, z.core.$strip>, z.ZodObject<{
        type: z.ZodLiteral<"spawn-window">;
        title: z.ZodString;
        prompt: z.ZodString;
        appId: z.ZodOptional<z.ZodString>;
        width: z.ZodOptional<z.ZodNumber>;
        height: z.ZodOptional<z.ZodNumber>;
    }, z.core.$strip>, z.ZodObject<{
        type: z.ZodLiteral<"install">;
        name: z.ZodString;
        icon: z.ZodOptional<z.ZodString>;
        manifest: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
    }, z.core.$strip>, z.ZodObject<{
        type: z.ZodLiteral<"create-file">;
        name: z.ZodString;
        mime: z.ZodOptional<z.ZodString>;
        content: z.ZodOptional<z.ZodString>;
        location: z.ZodOptional<z.ZodEnum<{
            desktop: "desktop";
            folder: "folder";
            recyclebin: "recyclebin";
        }>>;
    }, z.core.$strip>, z.ZodObject<{
        type: z.ZodLiteral<"focus">;
        windowId: z.ZodString;
    }, z.core.$strip>, z.ZodObject<{
        type: z.ZodLiteral<"close">;
        windowId: z.ZodString;
    }, z.core.$strip>, z.ZodObject<{
        type: z.ZodLiteral<"chrome">;
        set: z.ZodRecord<z.ZodString, z.ZodString>;
    }, z.core.$strip>], "type">>>;
}, z.core.$strip>;
export type ParsedSyscall = z.infer<typeof syscallSchema>;
export type ParsedSyscallBatch = z.infer<typeof syscallBatchSchema>;
/** The fully parsed AI output. */
export interface ParsedAiOutput {
    /** Full HTML body (mode 'full'). */
    html?: string;
    /** Region replacements (mode 'regions'). */
    regions?: {
        region: string;
        html: string;
    }[];
    /** Full HTML document to run in a sandboxed iframe (real JS allowed). */
    applet?: string;
    syscalls: ParsedSyscall[];
    summary: string;
}

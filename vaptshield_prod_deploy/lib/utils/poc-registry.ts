/**
 * Z+ SECURITY & ARCHITECTURE: PoC File Registry
 * 
 * Why this exists:
 * React Hook Form and JSON.stringify cannot serialize 'File' objects.
 * When the PoC Builder state is synced to the main form, the raw Files are lost.
 * This registry acts as a temporary memory-safe store for raw File objects
 * indexed by their unique image IDs, allowing the onSubmit handler to
 * retrieve them for final batch upload to Supabase.
 */

class PoCFileRegistry {
    private static instance: PoCFileRegistry;
    private registry: Map<string, File> = new Map();

    private constructor() {}

    public static getInstance(): PoCFileRegistry {
        if (!PoCFileRegistry.instance) {
            PoCFileRegistry.instance = new PoCFileRegistry();
        }
        return PoCFileRegistry.instance;
    }

    /**
     * Registers a file with a unique ID.
     */
    public set(id: string, file: File): void {
        this.registry.set(id, file);
    }

    /**
     * Retrieves a file by its ID.
     */
    public get(id: string): File | undefined {
        return this.registry.get(id);
    }

    /**
     * Removes a file from the registry.
     */
    public delete(id: string): void {
        this.registry.delete(id);
    }

    /**
     * Clears the entire registry (call after form submission).
     */
    public clear(): void {
        this.registry.clear();
    }
}

export const pocRegistry = PoCFileRegistry.getInstance();

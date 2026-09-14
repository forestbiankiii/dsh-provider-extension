/** Model and reasoning-effort seat; context selection is explicitly unsupported. */
import { type ReactNode } from 'react';
import type { ModelSelection } from '@deepseek-ai/dsh-api-session-controller/types';
import type { SnapshotStore } from '@deepseek-ai/dsh-client-store';
import type { ModelDirectoryState } from '@deepseek-ai/dsh-client-ui-model-selection/client';
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots';
/** Per-session injected seat dependencies. */
export interface ModelPanelInjected {
    hooks: {
        /** Session model directory bound by the renderer as useDirectory. */
        directory: SnapshotStore<ModelDirectoryState>;
    };
    /** Load the session's shared model directory. */
    loadDirectory: () => Promise<void>;
    /** Submit one complete selection through the shared directory. */
    select: (selection: ModelSelection) => Promise<void>;
}
/** Complete conversation-seat props. */
export type ModelPanelProps = PropsRuntime<'conversation.input.right'> & PropsLocale<'modelPanel'> & InjectFace<ModelPanelInjected>;
/** Render the model seat and its combined panel. */
export declare function ModelPanel({ useDirectory, loadDirectory, select, t }: ModelPanelProps): ReactNode;

/** Provider and model/reasoning controls that replace the shipped model seat. */
import { type ReactNode } from 'react';
import type { ModelSelection } from '@deepseek-ai/dsh-api-session-controller/types';
import type { SnapshotStore } from '@deepseek-ai/dsh-client-store';
import type { ModelDirectoryState } from '@deepseek-ai/dsh-client-ui-model-selection/client';
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots';
/** Per-session injected seat dependencies. */
export interface ModelPanelInjected {
    /** Addressed subagent sessions cannot use Agent-bound model selection. */
    available: boolean;
    hooks: {
        /** Session model directory bound by the renderer as useDirectory. */
        directory: SnapshotStore<ModelDirectoryState>;
    };
    /** Load the session's shared model directory. */
    loadDirectory: () => Promise<void>;
    /** Submit one complete selection through the shared directory. */
    select: (selection: ModelSelection) => Promise<void>;
}
/** Complete replacement-seat props, including the composer's lock state. */
export type ModelPanelProps = PropsRuntime<'conversation.input.model'> & PropsLocale<'modelPanel'> & InjectFace<ModelPanelInjected>;
/** Render separate provider and model controls inside the official model seat. */
export declare function ModelPanel({ locked, available, useDirectory, loadDirectory, select, t }: ModelPanelProps): ReactNode;

import { MdPos } from '@techie_doubts/toastmark';
import { EditorType } from '@t/editor';

export interface SnapshotSelection {
  anchor: MdPos;
  head: MdPos;
  collapsed: boolean;
}

export interface Snapshot {
  md: string;
  selection: SnapshotSelection;
  scrollTop?: number;
  mode: EditorType;
  time: number;
}

type ApplySnapshot = (snapshot: Snapshot) => void;

export default class SnapshotHistory {
  private undoStack: Snapshot[] = [];

  private redoStack: Snapshot[] = [];

  push(snapshot: Snapshot) {
    this.undoStack.push(snapshot);
    this.redoStack = [];
  }

  canUndo() {
    return this.undoStack.length > 1;
  }

  canRedo() {
    return this.redoStack.length > 0;
  }

  undo() {
    if (!this.canUndo()) {
      return null;
    }

    const current = this.undoStack.pop() as Snapshot;

    this.redoStack.push(current);

    return this.undoStack[this.undoStack.length - 1] || null;
  }

  redo() {
    if (!this.canRedo()) {
      return null;
    }

    const next = this.redoStack.pop() as Snapshot;

    this.undoStack.push(next);

    return next;
  }

  applySnapshot(snapshot: Snapshot, apply: ApplySnapshot) {
    apply(snapshot);
  }

  size() {
    return { undo: this.undoStack.length, redo: this.redoStack.length };
  }
}

import React from "react";
import ActionButton from "./ActionButton";
import ProgressBar from "./ProgressBar";

export default function TaskRow({ task, refreshTask, refreshing, progress, stage }) {
  return (
    <div className="task-row">
      <div className="task-main">
        <div>
          <strong>{task.state}</strong> - <code>{task.task_id}</code>
        </div>
        <div className="small-text">{stage}</div>
        <ProgressBar progress={progress} />
        {task?.meta?.processed !== undefined && task?.meta?.total !== undefined ? (
          <div className="small-text">Ilerleme: {task.meta.processed}/{task.meta.total}</div>
        ) : null}
      </div>
      <ActionButton loading={refreshing} loadingText="Yenileniyor..." onClick={() => refreshTask(task.task_id)}>
        Durumu Yenile
      </ActionButton>
    </div>
  );
}

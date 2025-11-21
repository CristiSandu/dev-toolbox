"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { invoke } from "@tauri-apps/api/core";

export default function TaskGenerator() {
  const [name, setName] = useState("");
  const [number, setNumber] = useState("");
  const [type, setType] = useState("feature");
  const [tasks, setTasks] = useState<any[]>([]);

  const loadTasks = async () => {
    const results = await invoke("get_tasks");
    setTasks(results as any[]);
  };

  useEffect(() => {
    loadTasks();
  }, []);

  const generate = async () => {
    const normalizedName = name.toLowerCase().replace(/[^a-zA-Z0-9]+/g, "-");
    const branch = `${type}/${number}-${normalizedName}`;
    const pr = `[${type.toUpperCase()}][${number}] ${name}`;

    await invoke("save_task", {
      name,
      number,
      featureType: type,
      branch,
      prTitle: pr,
    });

    await loadTasks();

    setName("");
    setNumber("");
  };

  return (
    <div className="space-y-8 max-w-3xl">
      <Card>
        <CardHeader>
          <CardTitle>Task Generator</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Input
            placeholder="Task Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />

          <Input
            placeholder="Task Number"
            value={number}
            onChange={(e) => setNumber(e.target.value)}
          />

          <Select value={type} onValueChange={setType}>
            <SelectTrigger>
              <SelectValue placeholder="Feature type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="feature">Feature</SelectItem>
              <SelectItem value="bugfix">Bugfix</SelectItem>
              <SelectItem value="hotfix">Hotfix</SelectItem>
            </SelectContent>
          </Select>

          <Button onClick={generate}>Generate & Save</Button>
        </CardContent>
      </Card>

      {/* HISTORY LIST */}
      <Card>
        <CardHeader>
          <CardTitle>Saved Tasks</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {tasks.map((task) => (
              <div
                key={task.id}
                className="border rounded p-3 flex flex-col bg-muted/20 hover:bg-muted transition"
              >
                <span className="font-medium text-lg">{task.pr_title}</span>
                <span className="text-sm text-muted-foreground">
                  Branch: {task.branch}
                </span>
                <span className="text-xs text-muted-foreground">
                  Created: {task.created_at}
                </span>
              </div>
            ))}

            {tasks.length === 0 && (
              <p className="text-muted-foreground text-sm">
                No tasks saved yet.
              </p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

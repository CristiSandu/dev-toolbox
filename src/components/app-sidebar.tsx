"use client";

import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
} from "@/components/ui/sidebar";

import { Link, useLocation } from "react-router-dom";
import { ClipboardList, Code, Diff, QrCode } from "lucide-react";

export function AppSidebar() {
  const location = useLocation();

  const links = [
    { to: "/task", label: "Task Generator", icon: ClipboardList },
    { to: "/xaml", label: "XAML Formatter", icon: Code },
    { to: "/diff", label: "Diff Viewer", icon: Diff },
    { to: "/codes", label: "Code Generator", icon: QrCode },
  ];

  return (
    <Sidebar className="border-r w-64">
      <SidebarHeader className="text-xl font-semibold p-4">
        Dev Toolbox
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Tools</SidebarGroupLabel>
          <SidebarMenu>
            {links.map((item) => {
              const Icon = item.icon;
              const active = location.pathname === item.to;

              return (
                <SidebarMenuItem key={item.to}>
                  <SidebarMenuButton asChild isActive={active}>
                    <Link to={item.to} className="flex items-center gap-2">
                      <Icon size={18} />
                      {item.label}
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              );
            })}
          </SidebarMenu>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}

"use client";

import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarHeader,
  useSidebar, // 👈 import this
} from "@/components/ui/sidebar";

import { Link, useLocation } from "react-router-dom";
import { ClipboardList, Code, QrCode } from "lucide-react";
import logo from "../assets/app-icon.png";

export function AppSidebar() {
  const location = useLocation();
  const { state } = useSidebar(); // "expanded" | "collapsed"

  const links = [
    { to: "/task", label: "Task Generator", icon: ClipboardList },
    { to: "/xaml", label: "XAML Formatter", icon: Code },
    { to: "/codes", label: "Code Generator", icon: QrCode },
  ];

  return (
    <Sidebar variant="inset" collapsible="icon" className="border-r w-64">
      <SidebarHeader className="flex items-center justify-center py-4">
        <img
          src={logo}
          alt="Dev Toolbox Logo"
          className={`aspect-square object-contain rounded-md mb-2 transition-all duration-200
            ${state === "expanded" ? "size-32" : "size-8"}`}
        />
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

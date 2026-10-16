"use client";

// The actions on a row of the student list: straight to a part of the
// student's record, or an email to them.
import {
  Banknote,
  GraduationCap,
  History,
  KeyRound,
  Mail,
  MoreHorizontal,
  UserRound,
} from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function StudentRowMenu({
  studentNumber,
  fullName,
  email,
}: {
  studentNumber: string;
  fullName: string;
  email: string;
}) {
  const record = `/staff/students/${studentNumber}`;
  const parts = [
    { tab: "fees", label: "Fees", icon: Banknote },
    { tab: "results", label: "Results", icon: GraduationCap },
    { tab: "history", label: "History", icon: History },
    { tab: "sign-in", label: "Sign-in", icon: KeyRound },
  ];
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" />}>
        <MoreHorizontal />
        <span className="sr-only">Actions for {fullName}</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-44">
        <DropdownMenuItem render={<Link href={record} />}>
          <UserRound />
          Open record
        </DropdownMenuItem>
        {parts.map(({ tab, label, icon: Icon }) => (
          <DropdownMenuItem
            key={tab}
            render={<Link href={`${record}?tab=${tab}`} />}
          >
            <Icon />
            {label}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem render={<a href={`mailto:${email}`} />}>
          <Mail />
          Email {fullName}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

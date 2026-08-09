"use client"

import * as React from "react"
import { Toaster as Sonner } from "sonner"

function Toaster(props: React.ComponentProps<typeof Sonner>) {
  return (
    <Sonner
      theme="dark"
      position="bottom-right"
      className="toaster group"
      toastOptions={{
        classNames: {
          toast:
            "group toast !rounded-lg !border !border-ring/70 !bg-card !text-foreground",
          title: "!text-sm !font-medium",
          description: "!text-xs !text-muted-foreground",
          actionButton: "!rounded-md !bg-primary !font-medium !text-primary-foreground",
          cancelButton: "!rounded-md !bg-muted !font-medium !text-muted-foreground",
          closeButton: "!bg-card !text-muted-foreground",
          success: "!border-up/25",
          error: "!border-down/25",
          warning: "!border-warn/25",
        },
      }}
      {...props}
    />
  )
}

export { Toaster }

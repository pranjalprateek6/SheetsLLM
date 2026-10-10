import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-medium ring-offset-background transition-[color,background-color,border-color,box-shadow,transform] duration-150 ease-[cubic-bezier(0.25,0.46,0.45,0.94)] motion-safe:active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        // A raised fill: inner top highlight plus a short contact shadow
        default:
          "bg-primary text-primary-foreground shadow-[0_1px_2px_rgb(9_9_11/0.12),inset_0_1px_0_rgb(255_255_255/0.14)] hover:bg-primary/90",
        destructive:
          "bg-destructive text-destructive-foreground shadow-[0_1px_2px_rgb(9_9_11/0.12),inset_0_1px_0_rgb(255_255_255/0.12)] hover:bg-destructive/90",
        outline:
          "border border-border bg-background shadow-xs hover:bg-accent hover:text-accent-foreground dark:bg-card",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-secondary/70",
        ghost: "hover:bg-accent hover:text-accent-foreground",
        link: "text-primary-accent underline-offset-4 hover:underline",
        // Marketing pills: a light pill as the one primary call to action on
        // the dark site, and a glass pill beside it
        inverse:
          "rounded-full border border-foreground/90 bg-foreground/90 text-background shadow-[0_1px_1px_rgb(0_0_0/0.07),0_3px_2px_rgb(0_0_0/0.04)] hover:bg-foreground",
        glass:
          "rounded-full bg-white/[0.05] text-foreground shadow-[inset_0_0_0_1px_rgb(255_255_255/0.03),inset_0_1px_0_rgb(255_255_255/0.04),0_0_0_1px_rgb(0_0_0/0.6),0_4px_4px_rgb(0_0_0/0.1)] hover:bg-white/[0.09]",
      },
      size: {
        default: "h-9 px-4",
        sm: "h-8 px-3 text-[13px]",
        lg: "h-11 px-6 text-[15px]",
        icon: "h-9 w-9",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button"
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    )
  }
)
Button.displayName = "Button"

export { Button, buttonVariants }

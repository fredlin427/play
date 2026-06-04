import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/cn";

const badgeVariants = cva(
  "inline-flex items-center rounded-md border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-blue-400 focus:ring-offset-2",
  {
    variants: {
      variant: {
        default: "border-transparent bg-blue-600 text-white",
        secondary: "border-transparent bg-gray-100 text-gray-800",
        destructive: "border-transparent bg-red-600 text-white",
        success: "border-transparent bg-green-600 text-white",
        warning: "border-transparent bg-yellow-500 text-white",
        outline: "border-gray-300 text-gray-700",
        riskLow: "border-transparent bg-green-100 text-green-800",
        riskMedium: "border-transparent bg-yellow-100 text-yellow-800",
        riskHigh: "border-transparent bg-red-100 text-red-800",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };

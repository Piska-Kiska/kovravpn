// src/components/Logo.tsx
import Image from "next/image";

interface Props {
  size?: number;
  className?: string;
}

export default function Logo({ size = 28, className = "" }: Props) {
  return (
    <Image
      src="/logo.png"
      alt="Kovra"
      width={size}
      height={size}
      className={className}
      style={{ objectFit: "contain" }}
    />
  );
}

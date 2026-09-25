// src/components/cabinet/index.ts — public API of the cabinet UI kit.
export { CabinetRoot, type CabinetRootProps } from "./CabinetRoot";
export { Icon, type IconProps } from "./Icon";
export { Button, ButtonLink, type ButtonProps, type ButtonLinkProps, type ButtonVariant, type ButtonSize } from "./Button";
export { Field, PasswordField, type FieldProps, type PasswordFieldProps } from "./Field";
export { OtpInput, OTP_LENGTH, type OtpInputProps, type OtpInputHandle } from "./OtpInput";
export { Segmented, type SegmentedProps, type SegmentedOption } from "./Segmented";
export { Notice, type NoticeProps, type NoticeTone } from "./Notice";
export { CopyField, type CopyFieldProps } from "./CopyField";
export { CodeCard, type CodeCardProps } from "./CodeCard";
export { Menu, type MenuProps, type MenuItem, type MenuItemKind, type MenuTriggerProps } from "./Menu";
export { LangMenu, type LangMenuProps } from "./LangMenu";
export { Dialog, ConfirmDialog, type DialogProps, type ConfirmDialogProps } from "./Dialog";
export { AuthShell, type AuthShellProps } from "./AuthShell";
export { TelegramAuth, type TelegramAuthProps } from "./TelegramAuth";
export { useDocumentTitle } from "./useDocumentTitle";
export { cx, cssVars, readJson, EMAIL_RE, type ApiBody } from "./util";

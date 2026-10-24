"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Store, IdCard, KeyRound, UserRound, Share2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ImageUploader, SocialLinksFields, TwoColumnSections } from "@merqo/ui";
import { Section } from "@/components/widgets/ticket-section";
import { MediaImage } from "@/components/widgets/media-image";
import {
  uploadQkitImage,
  removeReplacedAvatar,
} from "@/lib/image-upload-adapter";
import { resizeToWebp } from "@merqo/ui";
import { createClient } from "@/lib/supabase/client";
import { useAsyncAction } from "@/hooks/use-async-action";
import {
  profileNameSchema,
  displayNameSchema,
  passwordChangeSchema,
  socialLinksSchema,
} from "@/lib/schemas";
import { FORM_ERROR_CLASS, FORM_LABEL_CLASS } from "@/lib/utils";
import type { SocialLinks } from "@/lib/types";
import { updateStallName, updateSocialLinks } from "./actions";

interface Props {
  stallName: string;
  displayName: string;
  email: string;
  vendorId: string;
  avatarUrl: string | null;
  socialLinks: SocialLinks;
}

function FieldError({ id, message }: { id?: string; message: string | null }) {
  if (!message) return null;
  return (
    <p id={id} className={FORM_ERROR_CLASS}>
      {message}
    </p>
  );
}

export function ProfileForm({
  stallName,
  displayName,
  email,
  vendorId,
  avatarUrl,
  socialLinks,
}: Props) {
  const router = useRouter();
  const supabase = createClient();

  // Stall name (vendors.name) — persisted via a server action + RLS.
  const [name, setName] = useState(stallName);
  const [nameError, setNameError] = useState<string | null>(null);
  const { pending: savingName, run: runName } = useAsyncAction(
    "Could not save your stall name. Please try again.",
  );

  // Profile icon (auth user_metadata.avatar_url) — the ImageUploader handles the
  // storage upload; we persist the returned URL on the auth user, same channel
  // as the display name. null clears it and the initials badge takes over.
  const [avatar, setAvatar] = useState(avatarUrl);
  const { run: runAvatar } = useAsyncAction();

  // Display name (auth user_metadata) — persisted via the browser auth client.
  const [display, setDisplay] = useState(displayName);
  const [displayError, setDisplayError] = useState<string | null>(null);
  const { pending: savingDisplay, run: runDisplay } = useAsyncAction(
    "Could not save your display name. Please try again.",
  );

  // Change password — persisted via the browser auth client.
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [pwError, setPwError] = useState<string | null>(null);
  const { pending: savingPw, run: runPw } = useAsyncAction(
    "Could not update your password. Please try again.",
  );

  // Social/website links (vendors.social_links) — profile-level defaults, can
  // be overridden per booth on the booth's own edit page.
  const [links, setLinks] = useState<SocialLinks>(socialLinks);
  const [linksError, setLinksError] = useState<string | null>(null);
  const { pending: savingLinks, run: runLinks } = useAsyncAction(
    "Could not save your links. Please try again.",
  );

  function saveLinks() {
    const parsed = socialLinksSchema.safeParse(links);
    if (!parsed.success) {
      setLinksError(parsed.error.issues[0]?.message ?? "Check your links");
      return;
    }
    setLinksError(null);
    return runLinks(async () => {
      const res = await updateSocialLinks(parsed.data);
      if (!res.success) {
        toast.error(res.error);
        return;
      }
      toast.success("Links saved");
      router.refresh();
    });
  }

  function saveStall() {
    const parsed = profileNameSchema.safeParse({ name });
    if (!parsed.success) {
      setNameError(parsed.error.issues[0]?.message ?? "Invalid stall name");
      return;
    }
    setNameError(null);
    return runName(async () => {
      const res = await updateStallName({ name: parsed.data.name });
      if (!res.success) {
        toast.error(res.error);
        return;
      }
      toast.success("Stall name saved");
      router.refresh();
    });
  }

  function saveAvatar(url: string | null) {
    const previousAvatar = avatar;
    setAvatar(url);
    return runAvatar(async () => {
      try {
        const { error } = await supabase.auth.updateUser({
          data: { avatar_url: url },
        });
        if (error) {
          setAvatar(previousAvatar);
          // The upload landed but the save did not, so the new object is
          // referenced nowhere.
          if (url && url !== previousAvatar) void removeReplacedAvatar(url);
          toast.error(error.message);
          return;
        }
        if (previousAvatar && previousAvatar !== url)
          void removeReplacedAvatar(previousAvatar);
        toast.success(url ? "Profile icon saved" : "Profile icon removed");
        router.refresh();
      } catch {
        setAvatar(previousAvatar);
        toast.error(
          "Could not save your profile icon. Refresh before trying again.",
        );
      }
    });
  }

  function saveDisplayName() {
    const parsed = displayNameSchema.safeParse({ displayName: display });
    if (!parsed.success) {
      setDisplayError(parsed.error.issues[0]?.message ?? "Invalid name");
      return;
    }
    setDisplayError(null);
    return runDisplay(async () => {
      const { error } = await supabase.auth.updateUser({
        data: { display_name: parsed.data.displayName },
      });
      if (error) {
        toast.error(error.message);
        return;
      }
      toast.success("Display name saved");
      router.refresh();
    });
  }

  function savePassword() {
    const parsed = passwordChangeSchema.safeParse({ password, confirm });
    if (!parsed.success) {
      setPwError(parsed.error.issues[0]?.message ?? "Check your password");
      return;
    }
    setPwError(null);
    return runPw(async () => {
      const { error } = await supabase.auth.updateUser({
        password: parsed.data.password,
      });
      if (error) {
        toast.error(error.message);
        return;
      }
      toast.success("Password updated");
      setPassword("");
      setConfirm("");
    });
  }

  // Two independent flex-column stacks, not a CSS grid: a grid's row
  // tracks size to the tallest cell in that row, so once "Social &
  // website" (SocialLinksFields, several rows) outgrew "Stall name" (one
  // input), every row after it started late in BOTH columns — a gap under
  // "Profile icon"/"Display name" that had nothing to do with their own
  // content. Same fix as settings-form.tsx's board-timing layout; each
  // column stacks its own sections instead. Column 1: stall name, profile
  // picture, change password. Column 2: display name, social links — the
  // standard order for every kit's profile page, not just qkit's.
  return (
    <TwoColumnSections
      columnOne={
        <>
          <Section
            icon={<Store className="size-5" />}
            eyebrow="Shown to customers"
            title="Stall name"
            description="The name on your booth page and order tickets."
          >
            <div className="space-y-2">
              <Label htmlFor="stall-name" className={FORM_LABEL_CLASS}>
                Stall name
              </Label>
              <Input
                id="stall-name"
                value={name}
                maxLength={100}
                onChange={(e) => setName(e.target.value)}
                className="h-11 rounded-xl"
                aria-invalid={!!nameError}
                aria-describedby={nameError ? "stall-name-error" : undefined}
              />
              <FieldError id="stall-name-error" message={nameError} />
            </div>
            <div className="flex justify-end">
              <Button
                type="button"
                onClick={saveStall}
                disabled={savingName || name === stallName}
                className="h-10 rounded-xl font-semibold"
              >
                {savingName ? "Saving…" : "Save stall name"}
              </Button>
            </div>
          </Section>

          <Section
            icon={<UserRound className="size-5" />}
            eyebrow="Your account menu"
            title="Profile icon"
            description="A small image for your account menu. Defaults to your initials."
          >
            <div className="flex items-center gap-4">
              <ImageUploader
                bucket="booth-images"
                pathPrefix={vendorId}
                value={avatar}
                onChange={saveAvatar}
                onUpload={uploadQkitImage}
                resizeImage={resizeToWebp}
                imageComponent={MediaImage}
                variant="thumb"
              />
              <p className="text-xs text-muted-foreground">
                Square images look best. Remove it any time to fall back to your
                initials badge.
              </p>
            </div>
          </Section>

          <Section
            icon={<KeyRound className="size-5" />}
            eyebrow="Sign-in security"
            title="Change password"
            description="Set a new password. At least 8 characters."
          >
            <div className="space-y-2">
              <Label htmlFor="email" className={FORM_LABEL_CLASS}>
                Email
              </Label>
              <Input
                id="email"
                value={email}
                readOnly
                disabled
                className="h-11 rounded-xl bg-muted"
              />
              <p className="text-xs text-muted-foreground">
                Your sign-in email. It can&apos;t be changed here.
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="new-password" className={FORM_LABEL_CLASS}>
                New password
              </Label>
              <Input
                id="new-password"
                type="password"
                autoComplete="new-password"
                value={password}
                placeholder="••••••••"
                onChange={(e) => setPassword(e.target.value)}
                className="h-11 rounded-xl"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirm-password" className={FORM_LABEL_CLASS}>
                Confirm new password
              </Label>
              <Input
                id="confirm-password"
                type="password"
                autoComplete="new-password"
                value={confirm}
                placeholder="••••••••"
                onChange={(e) => setConfirm(e.target.value)}
                className="h-11 rounded-xl"
                aria-invalid={!!pwError}
                aria-describedby={
                  pwError ? "confirm-password-error" : undefined
                }
              />
              <FieldError id="confirm-password-error" message={pwError} />
            </div>
            <div className="flex justify-end">
              <Button
                type="button"
                onClick={savePassword}
                disabled={savingPw || !password || !confirm}
                className="h-10 rounded-xl font-semibold"
              >
                {savingPw ? "Updating…" : "Update password"}
              </Button>
            </div>
          </Section>
        </>
      }
      columnTwo={
        <>
          <Section
            icon={<IdCard className="size-5" />}
            eyebrow="Just for you"
            title="Display name"
            description="How qkit addresses you. Customers never see this."
          >
            <div className="space-y-2">
              <Label htmlFor="display-name" className={FORM_LABEL_CLASS}>
                Display name
              </Label>
              <Input
                id="display-name"
                value={display}
                maxLength={60}
                placeholder="e.g. Aisha"
                onChange={(e) => setDisplay(e.target.value)}
                className="h-11 rounded-xl"
                aria-invalid={!!displayError}
                aria-describedby={
                  displayError ? "display-name-error" : undefined
                }
              />
              <FieldError id="display-name-error" message={displayError} />
            </div>
            <div className="flex justify-end">
              <Button
                type="button"
                onClick={saveDisplayName}
                disabled={savingDisplay || display === displayName}
                className="h-10 rounded-xl font-semibold"
              >
                {savingDisplay ? "Saving…" : "Save display name"}
              </Button>
            </div>
          </Section>

          <Section
            icon={<Share2 className="size-5" />}
            eyebrow="Shown to customers"
            title="Social & website"
            description="Shown on the order-status page after a customer orders. Applies to every booth unless overridden on that booth's own page."
          >
            <SocialLinksFields
              value={links}
              onChange={setLinks}
              idPrefix="profile"
            />
            <FieldError message={linksError} />
            <div className="flex justify-end">
              <Button
                type="button"
                onClick={saveLinks}
                disabled={savingLinks}
                className="h-10 rounded-xl font-semibold"
              >
                {savingLinks ? "Saving…" : "Save links"}
              </Button>
            </div>
          </Section>
        </>
      }
    />
  );
}

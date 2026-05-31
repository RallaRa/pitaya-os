import SignageDisplay from '@/components/signage/SignageDisplay';

export default async function SignageSlugPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  return <SignageDisplay slug={slug} />;
}

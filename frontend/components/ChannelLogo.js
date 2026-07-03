export default function ChannelLogo({ channel, size = 20, style = {} }) {
  const map = {
    whatsapp: '/logos/whatsapp.svg',
    instagram: '/logos/instagram.svg',
    facebook: '/logos/facebook.svg',
    mercadolibre: '/logos/mercadolibre.svg',
    tiendanube: '/logos/tiendanube.svg',
    tiktok: '/logos/tiktok.svg',
  };
  const src = map[channel?.toLowerCase()];
  if (!src) return null;
  return (
    <img
      src={src}
      alt={channel}
      width={size}
      height={size}
      style={{ borderRadius: 4, flexShrink: 0, ...style }}
    />
  );
}

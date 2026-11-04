/**
 * MORE → Catalog: everything the business sells, in the same sections as the Certxa website's Catalog menu.
 */
import { useRouter } from 'expo-router';
import { CatalogScreen, List, Row } from '@/components/catalog/CatalogKit';

const SECTIONS = [
  { to: '/catalog/categories', title: 'Categories', hint: 'Group your services' },
  { to: '/services', title: 'Services', hint: 'Your menu, duration and rates' },
  { to: '/catalog/addons', title: 'Add-Ons', hint: 'Extras clients add to a service' },
  { to: '/catalog/packages', title: 'Packages', hint: 'Services and add-ons sold together' },
  { to: '/catalog/deals', title: 'Deals', hint: 'Vouchers for a package at a lower price' },
  { to: '/catalog/products', title: 'Products', hint: 'Retail items you sell' },
] as const;

export default function CatalogScreenMenu() {
  const router = useRouter();
  return (
    <CatalogScreen title="Catalog" help="catalog" onBack={() => router.back()} testID="catalog">
      <List>
        {SECTIONS.map((section) => (
          <Row key={section.to} testID={`catalog-${section.title.toLowerCase().replace(/[^a-z]/g, '')}`} title={section.title} hint={section.hint} onPress={() => router.push(section.to)} />
        ))}
      </List>
    </CatalogScreen>
  );
}

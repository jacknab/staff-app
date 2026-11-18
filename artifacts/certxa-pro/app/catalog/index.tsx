/**
 * MORE → Catalog: everything the business sells, in the same sections as the Certxa website's Catalog menu. On a tablet
 * the chosen section opens on the right of the list, starting with Services (owner, 2026-11-19; components/TabletSplit.tsx).
 */
import { useState, type ComponentType } from 'react';
import { useRouter } from 'expo-router';
import { CatalogScreen, List, Row } from '@/components/catalog/CatalogKit';
import { useIsTablet } from '@/components/TabletLauncher';
import { TabletSplit } from '@/components/TabletSplit';
import CategoriesScreen from './categories';
import ServicesScreen from '../services';
import AddonsScreen from './addons';
import AddonGroupsScreen from './addon-groups';
import PackagesScreen from './packages';
import ProductsScreen from './products';

const SECTIONS: { to: string; title: string; hint: string; Screen: ComponentType }[] = [
  { to: '/catalog/categories', title: 'Categories', hint: 'Group your services', Screen: CategoriesScreen },
  { to: '/services', title: 'Services', hint: 'Your menu, duration and rates', Screen: ServicesScreen },
  { to: '/catalog/addons', title: 'Add-Ons', hint: 'Extras clients add to a service', Screen: AddonsScreen },
  { to: '/catalog/addon-groups', title: 'Add-on Groups', hint: 'Add-ons several services share', Screen: AddonGroupsScreen },
  { to: '/catalog/packages', title: 'Packages', hint: 'Services and add-ons sold together', Screen: PackagesScreen },
  // { to: '/catalog/deals', title: 'Deals', hint: 'Vouchers for a package at a lower price' }, // marketplace removed 2026-11-07
  { to: '/catalog/products', title: 'Products', hint: 'Retail items you sell', Screen: ProductsScreen },
];

export default function CatalogScreenMenu() {
  const router = useRouter();
  const isTablet = useIsTablet();
  const [picked, setPicked] = useState<string | null>('/services');
  const page = (
    <CatalogScreen title="Catalog" help="catalog" onBack={() => router.back()} testID="catalog">
      <List>
        {SECTIONS.map((section) => (
          <Row key={section.to} testID={`catalog-${section.title.toLowerCase().replace(/[^a-z]/g, '')}`} title={section.title} hint={section.hint}
            selected={isTablet && picked === section.to} onPress={() => (isTablet ? setPicked(section.to) : router.push(section.to as never))} />
        ))}
      </List>
    </CatalogScreen>
  );
  if (!isTablet) return page;
  const section = SECTIONS.find((s) => s.to === picked);
  return <TabletSplit list={page} pane={section ? { key: section.to, Screen: section.Screen } : null} onClose={() => setPicked('/services')} />;
}

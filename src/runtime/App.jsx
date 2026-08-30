import { NavLink, Navigate, Route, Routes, useNavigate, useParams } from 'react-router-dom';
import ActivityPage from './ActivityPage.jsx';
import BusinessWorkspacePage from './BusinessWorkspacePage.jsx';
import ExplorePage from './ExplorePage.jsx';
import LocationPage from './LocationPage.jsx';
import MembershipPage from './MembershipPage.jsx';
import NotificationsPage from './NotificationsPage.jsx';
import ProfilePage from './ProfilePage.jsx';
import RoutePage from './RoutePage.jsx';
import SavedPage from './SavedPage.jsx';
import SocialPage from './SocialPage.jsx';
import WorkspacePage from './WorkspacePage.jsx';

const navItems = [['/', 'Home'], ['/nearby', 'Explore'], ['/route', 'Route'], ['/saved', 'Saved'], ['/profile', 'Profile']];
function Layout({ children }) { return <div className="app-shell"><header className="topbar"><div><div className="eyebrow">KLEENEST</div><div className="brand">Find a restroom. Get moving.</div></div></header><main>{children}</main><nav className="bottom-nav" aria-label="Primary navigation">{navItems.map(([to,label])=><NavLink key={to} to={to} end={to==='/' } className={({isActive})=>isActive?'nav-link active':'nav-link'}>{label}</NavLink>)}</nav></div>; }
function Home() { const navigate=useNavigate(); return <Layout><section className="hero panel"><div className="eyebrow">NEAREST-FIRST</div><h1>Find a bathroom without the detour.</h1><p>Kleenest starts with the fastest useful action: find nearby restroom options, choose one, and start navigation.</p><button className="primary" onClick={()=>navigate('/nearby')}>Find nearby restrooms</button></section><section className="panel compact"><h2>Simple by default</h2><p>Use Explore for one-stop discovery. Open Route when you actually need multiple ordered stops.</p><div className="card-actions"><button className="secondary" onClick={()=>navigate('/activity')}>Your activity</button><button className="secondary" onClick={()=>navigate('/social')}>Find people</button><button className="secondary" onClick={()=>navigate('/notifications')}>Notifications</button></div></section></Layout>; }
const wrap=Component=>()=> <Layout><Component/></Layout>;
const WrappedActivity=wrap(ActivityPage),WrappedBusiness=wrap(BusinessWorkspacePage),WrappedExplore=wrap(ExplorePage),WrappedLocation=wrap(LocationPage),WrappedMembership=wrap(MembershipPage),WrappedNotifications=wrap(NotificationsPage),WrappedRoute=wrap(RoutePage),WrappedSaved=wrap(SavedPage),WrappedSocial=wrap(SocialPage),WrappedProfile=wrap(ProfilePage),WrappedWorkspace=wrap(WorkspacePage);
function LegacyPlaceRedirect(){const {id}=useParams();return <Navigate to={`/location/${encodeURIComponent(id||'')}`} replace/>;}
export default function App(){return <Routes><Route path="/" element={<Home/>}/><Route path="/nearby" element={<WrappedExplore/>}/><Route path="/map" element={<Navigate to="/nearby" replace/>}/><Route path="/discover" element={<Navigate to="/nearby" replace/>}/><Route path="/location/:id" element={<WrappedLocation/>}/><Route path="/place/:id" element={<LegacyPlaceRedirect/>}/><Route path="/route" element={<WrappedRoute/>}/><Route path="/saved" element={<WrappedSaved/>}/><Route path="/activity" element={<WrappedActivity/>}/><Route path="/social" element={<WrappedSocial/>}/><Route path="/notifications" element={<WrappedNotifications/>}/><Route path="/membership" element={<WrappedMembership/>}/><Route path="/workspace" element={<WrappedWorkspace/>}/><Route path="/workspace/business" element={<WrappedBusiness/>}/><Route path="/profile" element={<WrappedProfile/>}/><Route path="*" element={<Navigate to="/" replace/>}/></Routes>;}

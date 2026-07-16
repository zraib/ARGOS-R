// Wrappers: mount AminDesign components inside their PreviewProvider context.
function wrap(name) {
  return function Wrapped(props) {
    const A = window.AminDesign;
    if (!A || !A[name] || !A.PreviewProvider) return null;
    return React.createElement(A.PreviewProvider, null, React.createElement(A[name], props));
  };
}
window.DSW = {
  Chart: wrap('DashboardChartCard'),
  Donut: wrap('DashboardDonut'),
  Stats: wrap('StatsBar'),
  Badge: wrap('Badge'),
  ListCard: wrap('DashboardListCard'),
  Modal: wrap('Modal'),
  Avatar: wrap('Avatar'),
};
